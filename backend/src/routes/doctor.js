const express = require('express');
const { Op } = require('sequelize');

const {
  authenticate,
  requireRole,
} = require('../middleware/auth');

const {
  uploadPatientFile,
  uploadProfilePhoto,
  ALLOWED,
} = require('../middleware/upload');

const {
  User,
  DoctorProfile,
  PatientProfile,
  Surgery,
  CareEpisode,
  MedicalFile,
  DoctorNote,
  Medicine,
  FoodRestriction,
  Appointment,
  SOSAlert,
  ChatThread,
  ChatMessage,
  VitalsAssessment,
  AppointmentSlot,
} = require('../models');

const {
  notifyUser,
  notifyDoctor,
  notifyAdmins,
  notifyPatientAndDoctor,
} = require('../utils/realtime');

const {
  computeRecovery,
} = require('../utils/recovery');

const { normalizePhone, isValidPhone } = require('../utils/phone');
const sequelize = require('../config/db');
const { todayInAppTz, nowStamp, stampOf, isRealDate } = require('../utils/dates');
const fs = require('fs');
const path = require('path');
const { respondIfSlotTaken } = require('../utils/conflicts');
const { completeElapsedEpisodes } = require('../utils/episodes');
const { isValidVisitSelection } = require('../utils/visitSelection');

const router = express.Router();

router.use(
  authenticate,
  requireRole('doctor')
);

/* =========================================================
   HELPERS
   ========================================================= */

async function getDoctorProfile(userId) {
  return DoctorProfile.findOne({
    where: {
      userId,
    },
  });
}

/**
 * Verify that the doctor currently has an ACTIVE
 * CareEpisode for the specified patient.
 */
async function assertActiveMapping(
  doctorId,
  patientId,
  res
) {
  const careEpisode =
    await CareEpisode.findOne({
      where: {
        doctorId,
        patientId,
        status: 'active',
      },

      include: [
        {
          model: Surgery,
          as: 'surgery',
        },
      ],
    });

  if (
    !careEpisode ||
    !careEpisode.surgery
  ) {
    res.status(403).json({
      error:
        'This patient is not currently under your care.',
    });

    return null;
  }

  return careEpisode;
}

/**
 * Validate appointment time format.
 */
function isValidAppointmentTime(time) {
  return (
    typeof time === 'string' &&
    /^([01]\d|2[0-3]):[0-5]\d$/.test(
      time
    )
  );
}

/**
 * Check whether a doctor already has an upcoming
 * appointment at the requested date/time.
 *
 * excludeAppointmentId is used during rescheduling
 * so an appointment does not conflict with itself.
 */
async function hasDoctorConflict(
  doctorId,
  date,
  time,
  excludeAppointmentId = null
) {
  const where = {
    doctorId,
    date,
    time,
    status: 'upcoming',
  };

  if (excludeAppointmentId) {
    where.id = {
      [Op.ne]:
        excludeAppointmentId,
    };
  }

  return Appointment.findOne({
    where,
  });
}

/**
 * Check whether a patient already has an upcoming
 * appointment at the requested date/time.
 */
async function hasPatientConflict(
  patientId,
  date,
  time,
  excludeAppointmentId = null
) {
  const where = {
    patientId,
    date,
    time,
    status: 'upcoming',
  };

  if (excludeAppointmentId) {
    where.id = {
      [Op.ne]:
        excludeAppointmentId,
    };
  }

  return Appointment.findOne({
    where,
  });
}

/**
 * Synchronize the legacy Surgery recovery fields
 * from the active CareEpisode.
 *
 * CareEpisode is the source of truth.
 */
function syncSurgeryRecovery(
  surgery,
  careEpisode
) {
  if (!surgery || !careEpisode) {
    return;
  }

  surgery.recoveryTotalDays =
    careEpisode.expectedRecoveryDays;

  surgery.recoveryDaysRemaining =
    careEpisode.daysRemaining;

  if (
    careEpisode.startDate &&
    !surgery.startDate
  ) {
    surgery.startDate =
      careEpisode.startDate;
  }
}

const MED_FORMS = ['Tablet', 'Syrup', 'Injection', 'Ointment'];

/*
 * Latest vitals assessment per patient for the given care episodes. A
 * patient "needs review" when their latest reading is an outlier or the
 * trend says so - this is what the patient app tells them to "get clinical
 * review" for, and until now the doctor never saw it.
 */
async function latestAssessmentsByPatient(episodes) {
  const latest = new Map();
  if (!episodes.length) return latest;

  const rows = await VitalsAssessment.findAll({
    where: { careEpisodeId: episodes.map((episode) => episode.id) },
    order: [['measuredAt', 'DESC']],
  });

  rows.forEach((row) => {
    if (!latest.has(row.patientId)) latest.set(row.patientId, row);
  });

  return latest;
}

function needsReview(assessment) {
  return (
    Boolean(assessment) &&
    (assessment.anomalyLabel === 'outlier' ||
      assessment.trendLabel === 'Requires Attention')
  );
}

/* A doctor can only book/move an appointment into a slot the admin published for them. */
function findOpenSlot(doctorId, date, time) {
  return AppointmentSlot.findOne({
    where: { doctorId, date, time, isActive: true },
  });
}

/*
 * Shared checks for scheduling a time (follow-up or reschedule).
 * Returns an error message, or '' when the time is fine.
 */
async function validateScheduleTime(doctorId, date, time) {
  if (!isRealDate(date)) return 'Enter a valid date (YYYY-MM-DD).';
  if (!isValidAppointmentTime(time)) return 'Time must use HH:mm format.';
  if (stampOf(date, time) <= nowStamp()) return 'Choose a future date and time.';

  const slot = await findOpenSlot(doctorId, date, time);
  if (!slot) {
    return 'That time is not one of your published slots for that day. Ask the administrator to add it.';
  }

  return '';
}

/* =========================================================
   HOME
   ========================================================= */

router.get('/home', async (req, res) => {
  try {
    const doctorId = req.user.id;

    // Recoveries whose days have run out move to Completed before we list anything.
    await completeElapsedEpisodes(req.app.get('io'), { doctorId });
    const today = todayInAppTz();

    const activeEpisodes = await CareEpisode.findAll({
      where: { doctorId, status: 'active' },
      include: [{ model: Surgery, as: 'surgery' }],
    });

    const sosAlerts = await SOSAlert.findAll({
      where: { doctorId, status: 'pending' },
      order: [['createdAt', 'DESC']],
    });

    // Completed ones stay on today's list so "completed today" is real.
    const todaysAppointments = await Appointment.findAll({
      where: {
        doctorId,
        date: today,
        status: { [Op.in]: ['upcoming', 'completed'] },
      },
      order: [['time', 'ASC']],
    });

    const latest = await latestAssessmentsByPatient(activeEpisodes);
    const reviewEpisodes = activeEpisodes.filter((episode) =>
      needsReview(latest.get(episode.patientId))
    );

    const patientIds = [
      ...new Set([
        ...todaysAppointments.map((appointment) => appointment.patientId),
        ...reviewEpisodes.map((episode) => episode.patientId),
      ]),
    ];

    const [patientProfiles, patientUsers] = await Promise.all([
      PatientProfile.findAll({ where: { userId: patientIds } }),
      User.findAll({ where: { id: patientIds } }),
    ]);

    function enrichPatient(patientId) {
      const episode = activeEpisodes.find((item) => item.patientId === patientId);
      const profile = patientProfiles.find((item) => item.userId === patientId);
      const user = patientUsers.find((item) => item.id === patientId);

      return {
        patientName: user?.name || null,
        surgery: episode?.surgery?.surgeryName || null,
        bloodGroup: profile?.bloodGroup || null,
      };
    }

    res.json({
      sosAlerts: sosAlerts.map((alert) => ({
        id: alert.id,
        patientId: alert.patientId,
        patientName: alert.patientNameSnapshot,
        surgery: alert.surgerySnapshot,
        bloodGroup: alert.bloodGroupSnapshot,
        createdAt: alert.createdAt,
      })),

      todaysAppointments: todaysAppointments.map((appointment) => ({
        id: appointment.id,
        patientId: appointment.patientId,
        date: appointment.date,
        time: appointment.time,
        status: appointment.status,
        visitCategory: appointment.visitCategory,
        serviceType: appointment.serviceType,
        ...enrichPatient(appointment.patientId),
      })),

      needsReview: reviewEpisodes.map((episode) => {
        const assessment = latest.get(episode.patientId);
        return {
          patientId: episode.patientId,
          measuredAt: assessment.measuredAt,
          trendLabel: assessment.trendLabel,
          ...enrichPatient(episode.patientId),
        };
      }),
    });
  } catch (error) {
    console.error('Doctor home error:', error);

    res.status(500).json({
      error: 'Unable to load doctor home.',
    });
  }
});

/* =========================================================
   SOS
   ========================================================= */

router.post(
  '/sos/:id/acknowledge',
  async (req, res) => {
    try {
      const alert =
        await SOSAlert.findOne({
          where: {
            id: req.params.id,
            doctorId:
              req.user.id,
            status: 'pending',
          },
        });

      if (!alert) {
        return res.status(404).json({
          error:
            'Alert not found.',
        });
      }

      const activeEpisode =
        await CareEpisode.findOne({
          where: {
            doctorId:
              req.user.id,

            patientId:
              alert.patientId,

            status:
              'active',
          },
        });

      if (!activeEpisode) {
        return res.status(403).json({
          error:
            'This patient is no longer under your care.',
        });
      }

      alert.status =
        'acknowledged';

      alert.acknowledgedAt =
        new Date();

      await alert.save();

      notifyDoctor(
        req.app.get('io'),
        req.user.id,
        'sos_updated',
        { alertId: alert.id, status: alert.status }
      );

      res.json({
        message:
          'Acknowledged.',

        patientId:
          alert.patientId,
      });
    } catch (error) {
      console.error(
        'SOS acknowledgement error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to acknowledge SOS alert.',
      });
    }
  }
);

/* =========================================================
   PROFILE
   ========================================================= */

router.get(
  '/profile',
  async (req, res) => {
    try {
      const user =
        await User.findByPk(
          req.user.id
        );

      const profile =
        await getDoctorProfile(
          req.user.id
        );

      if (!user || !profile) {
        return res.status(404).json({
          error:
            'Doctor profile not found.',
        });
      }

      res.json({
        name: user.name,
        email: user.email,
        phone: user.phone,
        photoUrl:
          user.photoUrl,

        specialization:
          profile.specialization,

        bio:
          profile.bio,

        dutyStatus:
          profile.dutyStatus,

        uniqueDoctorId:
          profile.uniqueDoctorId,

        role: 'doctor',

        memberSince:
          user.createdAt,
      });
    } catch (error) {
      console.error(
        'Doctor profile error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load doctor profile.',
      });
    }
  }
);

router.put(
  '/profile',
  async (req, res) => {
    try {
      const { name, phone, specialization, bio } = req.body;

      const user = await User.findByPk(req.user.id);
      const profile = await getDoctorProfile(req.user.id);

      if (!user || !profile) {
        return res.status(404).json({ error: 'Doctor profile not found.' });
      }

      if (name !== undefined) {
        const value = typeof name === 'string' ? name.trim() : '';

        if (!value || value.length > 100) {
          return res.status(400).json({
            error: 'Name is required and must be 100 characters or fewer.',
          });
        }

        user.name = value;
      }

      if (phone !== undefined) {
        if (phone) {
          if (!isValidPhone(phone)) {
            return res.status(400).json({
              error: 'Enter a valid 10-digit mobile number.',
            });
          }
          user.phone = normalizePhone(phone);
        } else {
          user.phone = null;
        }
      }

      if (specialization !== undefined) {
        const value = typeof specialization === 'string' ? specialization.trim() : '';

        if (value.length > 100) {
          return res.status(400).json({
            error: 'Specialization must be 100 characters or fewer.',
          });
        }

        profile.specialization = value;
      }

      if (bio !== undefined) {
        const value = typeof bio === 'string' ? bio.trim() : '';

        if (value.length > 1000) {
          return res.status(400).json({
            error: 'Bio must be 1000 characters or fewer.',
          });
        }

        profile.bio = value;
      }

      await sequelize.transaction(async (transaction) => {
        await user.save({ transaction });
        await profile.save({ transaction });
      });

      res.json({ message: 'Profile updated.' });
    } catch (error) {
      console.error('Doctor profile update error:', error);

      res.status(500).json({
        error: 'Unable to update doctor profile.',
      });
    }
  }
);

/* Delete an old profile photo file; a missing file is fine. */
function removeStoredPhoto(photoUrl) {
  if (!photoUrl || !photoUrl.startsWith('/uploads/profile_photos/')) return;

  const file = path.join(
    __dirname,
    '..',
    '..',
    'uploads',
    'profile_photos',
    path.basename(photoUrl)
  );

  fs.unlink(file, () => {});
}

router.delete(
  '/profile/photo',
  async (req, res) => {
    try {
      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({ error: 'Doctor account not found.' });
      }

      const previousPhoto = user.photoUrl;

      user.photoUrl = null;
      await user.save();

      removeStoredPhoto(previousPhoto);

      res.json({ photoUrl: null });
    } catch (error) {
      console.error('Doctor profile photo removal error:', error);

      res.status(500).json({ error: 'Unable to remove profile photo.' });
    }
  }
);

router.post(
  '/profile/photo',
  uploadProfilePhoto.single(
    'photo'
  ),
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error:
            'No file uploaded.',
        });
      }

      const user =
        await User.findByPk(
          req.user.id
        );

      if (!user) {
        return res.status(404).json({
          error:
            'Doctor account not found.',
        });
      }

      const previousPhoto = user.photoUrl;

      user.photoUrl =
        `/uploads/profile_photos/${req.file.filename}`;

      await user.save();

      removeStoredPhoto(previousPhoto);

      res.json({
        photoUrl:
          user.photoUrl,
      });
    } catch (error) {
      console.error(
        'Doctor profile photo error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to update profile photo.',
      });
    }
  }
);

router.patch(
  '/profile/duty-status',
  async (req, res) => {
    try {
      const {
        dutyStatus,
      } = req.body;

      if (
        ![
          'on_duty',
          'off_duty',
        ].includes(dutyStatus)
      ) {
        return res.status(400).json({
          error:
            'Invalid status.',
        });
      }

      const profile =
        await getDoctorProfile(
          req.user.id
        );

      if (!profile) {
        return res.status(404).json({
          error:
            'Doctor profile not found.',
        });
      }

      profile.dutyStatus =
        dutyStatus;

      await profile.save();

      notifyAdmins(
        req.app.get('io'),
        'doctor_duty_updated',
        { doctorId: req.user.id, dutyStatus }
      );

      res.json({
        message:
          dutyStatus ===
          'on_duty'
            ? 'Status set to On Duty.'
            : 'Status set to Off Duty.',

        dutyStatus,
      });
    } catch (error) {
      console.error(
        'Duty status error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to update duty status.',
      });
    }
  }
);

/* =========================================================
   PATIENT DIRECTORY
   ========================================================= */

router.get(
  '/patients',
  async (req, res) => {
    try {
      await completeElapsedEpisodes(req.app.get('io'), { doctorId: req.user.id });

      // Ongoing and completed recoveries; the page shows them on separate tabs.
      const careEpisodes = await CareEpisode.findAll({
        where: {
          doctorId: req.user.id,
          status: { [Op.in]: ['active', 'completed'] },
        },
        include: [{ model: Surgery, as: 'surgery' }],
        order: [['createdAt', 'DESC']],
      });

      const patientIds = [...new Set(careEpisodes.map((episode) => episode.patientId))];

      const users = await User.findAll({ where: { id: patientIds } });

      const activeEpisodes = careEpisodes.filter((episode) => episode.status === 'active');
      const latest = await latestAssessmentsByPatient(activeEpisodes);

      const patients = careEpisodes.map((episode) => {
        const user = users.find((item) => item.id === episode.patientId);
        const surgery = episode.surgery;
        const isActive = episode.status === 'active';

        return {
          patientId: episode.patientId,
          surgeryId: surgery?.id || null,
          careEpisodeId: episode.id,
          name: user?.name || null,
          surgeryName: surgery?.surgeryName || null,
          recoveryDaysRemaining: isActive
            ? computeRecovery(episode.startDate, episode.expectedRecoveryDays).daysRemaining
            : 0,
          recoveryTotalDays: episode.expectedRecoveryDays,
          status: episode.status,
          startDate: episode.startDate,
          dischargeDate: episode.dischargeDate || null,
          completedAt: episode.completedAt || null,
          needsReview: isActive && needsReview(latest.get(episode.patientId)),
        };
      });

      res.json({ patients });
    } catch (error) {
      console.error('Doctor patients error:', error);

      res.status(500).json({ error: 'Unable to load patients.' });
    }
  }
);

/* =========================================================
   PATIENT DETAILS
   ========================================================= */

router.get(
  '/patients/:patientId',
  async (req, res) => {
    try {
      /*
       * Without ?episodeId this is the patient's current (active) recovery.
       * With it, the doctor can open any recovery they treated - including a
       * completed one, which is returned read-only (every write route below
       * still requires an active episode).
       */
      let careEpisode;

      await completeElapsedEpisodes(req.app.get('io'), {
        doctorId: req.user.id,
        patientId: req.params.patientId,
      });

      if (req.query.episodeId) {
        careEpisode = await CareEpisode.findOne({
          where: {
            id: req.query.episodeId,
            doctorId: req.user.id,
            patientId: req.params.patientId,
          },
          include: [{ model: Surgery, as: 'surgery' }],
        });

        if (!careEpisode || !careEpisode.surgery) {
          return res.status(403).json({
            error: 'This patient record is not available to you.',
          });
        }
      } else {
        // The current recovery; if it has just ended (or the link is stale), the
        // most recent completed one, read-only, rather than an error.
        const include = [{ model: Surgery, as: 'surgery' }];

        careEpisode =
          (await CareEpisode.findOne({
            where: { doctorId: req.user.id, patientId: req.params.patientId, status: 'active' },
            include,
          })) ||
          (await CareEpisode.findOne({
            where: { doctorId: req.user.id, patientId: req.params.patientId, status: 'completed' },
            include,
            order: [['completedAt', 'DESC'], ['createdAt', 'DESC']],
          }));

        if (!careEpisode || !careEpisode.surgery) {
          return res.status(403).json({
            error: 'This patient is not currently under your care.',
          });
        }
      }

      const surgery =
        careEpisode.surgery;

      const user =
        await User.findByPk(
          req.params.patientId
        );

      const profile =
        await PatientProfile.findOne({
          where: {
            userId:
              req.params.patientId,
          },
        });

      // Every file this doctor has ever uploaded for this patient, not just
      // the currently resolved episode - a patient re-admitted under a new
      // episode would otherwise make an older episode's files invisible
      // here even though the same doctor added them and can still manage them.
      const files =
        await MedicalFile.findAll({
          where: {
            patientId:
              req.params.patientId,

            uploadedByDoctorId:
              req.user.id,
          },

          order: [
            ['createdAt', 'DESC'],
          ],
        });

      const notes =
        await DoctorNote.findAll({
          where: {
            patientId:
              req.params.patientId,

            surgeryId:
              surgery.id,

            careEpisodeId:
              careEpisode.id,

            doctorId:
              req.user.id,
          },

          order: [
            ['createdAt', 'DESC'],
          ],
        });

      const medicines =
        await Medicine.findAll({
          where: {
            patientId:
              req.params.patientId,

            surgeryId:
              surgery.id,

            careEpisodeId:
              careEpisode.id,

            isActive: true,
          },

          order: [
            ['createdAt', 'DESC'],
          ],
        });

      const foodRestrictions =
        await FoodRestriction.findAll({
          where: {
            patientId:
              req.params.patientId,

            surgeryId:
              surgery.id,

            careEpisodeId:
              careEpisode.id,
          },

          order: [
            ['createdAt', 'DESC'],
          ],
        });

      const vitals = await VitalsAssessment.findAll({
        where: {
          patientId: req.params.patientId,
          careEpisodeId: careEpisode.id,
        },
        order: [['measuredAt', 'DESC']],
        limit: 30,
      });

      res.json({
        patient: {
          id: user?.id,
          name: user?.name,
          email: user?.email,
          phone: user?.phone,

          address:
            profile?.address,

          bloodGroup:
            profile?.bloodGroup,

          dateOfBirth:
            profile?.dateOfBirth,

          gender:
            profile?.gender,

          emergencyContact:
            profile?.emergencyContact,

          allergies:
            profile?.allergies,
        },

        surgery: {
          id: surgery.id,

          surgeryName:
            surgery.surgeryName,

          surgeryDate:
            surgery.surgeryDate,

          description:
            surgery.description,

          startDate:
            surgery.startDate,

          dischargeDate:
            surgery.dischargeDate,
        },

        recovery: {
          careEpisodeId:
            careEpisode.id,

          totalDays:
            careEpisode
              .expectedRecoveryDays,

          daysRemaining:
            careEpisode.status === 'active'
              ? computeRecovery(
                  careEpisode.startDate,
                  careEpisode
                    .expectedRecoveryDays
                ).daysRemaining
              : 0,

          status:
            careEpisode.status,

          startDate:
            careEpisode.startDate,

          completedAt:
            careEpisode.completedAt,

          dischargeDate:
            careEpisode.dischargeDate,
        },

        files,
        notes,
        medicines,
        foodRestrictions,

        readOnly: careEpisode.status !== 'active',

        vitals: vitals.map((item) => ({
          id: item.id,
          measuredAt: item.measuredAt,
          spo2: item.spo2,
          systolic: item.systolic,
          diastolic: item.diastolic,
          heartRate: item.heartRate,
          temperature: item.temperature,
          anomalyLabel: item.anomalyLabel,
          anomalyScore: item.anomalyScore,
          trendLabel: item.trendLabel,
        })),
        needsReview: careEpisode.status === 'active' && needsReview(vitals[0]),
      });
    } catch (error) {
      console.error(
        'Doctor patient details error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load patient details.',
      });
    }
  }
);

/* =========================================================
   RECOVERY DAYS
   ========================================================= */

router.post(
  '/patients/:patientId/recovery-days',
  async (req, res) => {
    try {
      const careEpisode = await assertActiveMapping(
        req.user.id,
        req.params.patientId,
        res
      );

      if (!careEpisode) return;

      const delta = Number(req.body.delta);

      if (!Number.isInteger(delta) || delta === 0 || Math.abs(delta) > 30) {
        return res.status(400).json({
          error: 'Change the recovery duration by 1 to 30 days at a time.',
        });
      }

      const currentTotal = Number(careEpisode.expectedRecoveryDays);

      /*
       * Days already completed come from the calendar (today minus
       * startDate), not from a stored counter that never moved on its own.
       */
      const completedDays = computeRecovery(
        careEpisode.startDate,
        currentTotal
      ).daysCompleted;

      const newTotal = Math.max(completedDays, currentTotal + delta, 1);

      if (newTotal > 730) {
        return res.status(400).json({
          error: 'Recovery duration cannot exceed 730 days.',
        });
      }

      const surgery = careEpisode.surgery;

      if (!surgery) {
        return res.status(500).json({
          error: 'The active care episode has no associated surgery.',
        });
      }

      careEpisode.expectedRecoveryDays = newTotal;
      careEpisode.daysRemaining = computeRecovery(
        careEpisode.startDate,
        newTotal
      ).daysRemaining;

      // Keep the legacy Surgery recovery fields in step; CareEpisode is the source of truth.
      syncSurgeryRecovery(surgery, careEpisode);

      await sequelize.transaction(async (transaction) => {
        await surgery.save({ transaction });
        await careEpisode.save({ transaction });
      });

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.params.patientId,
        req.user.id,
        'recovery_updated',
        { careEpisode }
      );

      // Reducing the plan down to today ends the recovery, like any other way
      // of running out of days.
      const completed =
        careEpisode.daysRemaining === 0 &&
        (await completeElapsedEpisodes(req.app.get('io'), { id: careEpisode.id })) > 0;

      res.json({
        careEpisodeId: careEpisode.id,
        surgeryId: surgery.id,
        daysCompleted: completedDays,
        daysRemaining: careEpisode.daysRemaining,
        totalDays: careEpisode.expectedRecoveryDays,
        status: completed ? 'completed' : careEpisode.status,
        completed,
      });
    } catch (error) {
      console.error('Recovery days error:', error);

      res.status(500).json({
        error: 'Unable to update recovery duration.',
      });
    }
  }
);

/* =========================================================
   MEDICAL FILES
   ========================================================= */

router.post(
  '/patients/:patientId/files',
  uploadPatientFile.single(
    'file'
  ),
  async (req, res) => {
    try {
      const careEpisode =
        await assertActiveMapping(
          req.user.id,
          req.params.patientId,
          res
        );

      if (!careEpisode) {
        return;
      }

      if (!req.file) {
        return res.status(400).json({
          error:
            'No file uploaded.',
        });
      }

      const fileType =
        ALLOWED[
          req.file.mimetype
        ];

      if (!fileType) {
        return res.status(400).json({
          error:
            'Only PDF, JPG, and PNG files are allowed.',
        });
      }

      const surgery =
        careEpisode.surgery;

      const record =
        await MedicalFile.create({
          patientId:
            req.params.patientId,

          surgeryId:
            surgery.id,

          careEpisodeId:
            careEpisode.id,

          uploadedByDoctorId:
            req.user.id,

          label: String(
            req.body.label || req.file.originalname
          )
            .trim()
            .slice(0, 150),

          fileUrl:
            `/uploads/patient_files/${req.file.filename}`,

          fileType,

          fileSize:
            req.file.size,
        });

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.params.patientId,
        req.user.id,
        'file_uploaded',
        { patientId: req.params.patientId }
      );

      res.status(201).json({
        file: record,
      });
    } catch (error) {
      console.error(
        'Medical file upload error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to upload medical file.',
      });
    }
  }
);

/* =========================================================
   PRIVATE DOCTOR NOTES
   ========================================================= */

router.post(
  '/patients/:patientId/notes',
  async (req, res) => {
    try {
      const careEpisode =
        await assertActiveMapping(
          req.user.id,
          req.params.patientId,
          res
        );

      if (!careEpisode) {
        return;
      }

      const content =
        typeof req.body.content ===
        'string'
          ? req.body.content.trim()
          : '';

      if (!content) {
        return res.status(400).json({
          error:
            'Note content is required.',
        });
      }

      if (content.length > 4000) {
        return res.status(400).json({
          error: 'Notes can be up to 4000 characters.',
        });
      }

      const note =
        await DoctorNote.create({
          patientId:
            req.params.patientId,

          surgeryId:
            careEpisode
              .surgery.id,

          careEpisodeId:
            careEpisode.id,

          doctorId:
            req.user.id,

          content,
        });

      notifyDoctor(req.app.get('io'), req.user.id, 'note_updated', {
        patientId: req.params.patientId,
      });

      res.status(201).json({
        note,
      });
    } catch (error) {
      console.error(
        'Doctor note error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to save doctor note.',
      });
    }
  }
);

router.delete(
  '/patients/:patientId/notes/:noteId',
  async (req, res) => {
    try {
      const careEpisode = await assertActiveMapping(
        req.user.id,
        req.params.patientId,
        res
      );

      if (!careEpisode) return;

      const note = await DoctorNote.findOne({
        where: {
          id: req.params.noteId,
          patientId: req.params.patientId,
          careEpisodeId: careEpisode.id,
          doctorId: req.user.id,
        },
      });

      if (!note) {
        return res.status(404).json({ error: 'Note not found.' });
      }

      await note.destroy();

      notifyDoctor(req.app.get('io'), req.user.id, 'note_updated', {
        patientId: req.params.patientId,
      });

      res.json({ message: 'Note deleted.' });
    } catch (error) {
      console.error('Doctor note deletion error:', error);

      res.status(500).json({ error: 'Unable to delete note.' });
    }
  }
);

router.delete(
  '/patients/:patientId/files/:fileId',
  async (req, res) => {
    try {
      // Scoped to files this doctor uploaded, not the currently active
      // episode - a patient can be re-admitted under a new episode while an
      // older, now-completed episode's files still need to stay manageable
      // by the doctor who added them.
      const file = await MedicalFile.findOne({
        where: {
          id: req.params.fileId,
          patientId: req.params.patientId,
          uploadedByDoctorId: req.user.id,
        },
      });

      if (!file) {
        return res.status(404).json({ error: 'File not found.' });
      }

      const storedName = path.basename(file.fileUrl || '');

      await file.destroy();

      if (storedName) {
        fs.unlink(
          path.join(__dirname, '..', '..', 'uploads', 'patient_files', storedName),
          () => {}
        );
      }

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.params.patientId,
        req.user.id,
        'file_uploaded',
        { patientId: req.params.patientId }
      );

      res.json({ message: 'File deleted.' });
    } catch (error) {
      console.error('Medical file deletion error:', error);

      res.status(500).json({ error: 'Unable to delete file.' });
    }
  }
);

/* =========================================================
   MEDICINES
   ========================================================= */

router.post(
  '/patients/:patientId/medicines',
  async (req, res) => {
    try {
      const careEpisode = await assertActiveMapping(
        req.user.id,
        req.params.patientId,
        res
      );

      if (!careEpisode) return;

      const { form, times, startDate, endDate } = req.body;
      const text = (value) => (typeof value === 'string' ? value.trim() : '');
      const name = text(req.body.name);
      const dosage = text(req.body.dosage);
      const frequency = text(req.body.frequency);

      if (!name || !dosage || !frequency) {
        return res.status(400).json({
          error: 'Name, dosage, and frequency are required.',
        });
      }

      if (name.length > 160 || dosage.length > 120 || frequency.length > 120) {
        return res.status(400).json({
          error: 'Medicine name, dosage or frequency is too long.',
        });
      }

      if (form !== undefined && !MED_FORMS.includes(form)) {
        return res.status(400).json({
          error: 'Choose a valid medicine form.',
        });
      }

      if (times !== undefined && !Array.isArray(times)) {
        return res.status(400).json({
          error: 'Medicine reminder times must be an array.',
        });
      }

      const validTimeFormat = /^([01]\d|2[0-3]):[0-5]\d$/;

      if (
        Array.isArray(times) &&
        (times.length > 12 ||
          !times.every(
            (time) => typeof time === 'string' && validTimeFormat.test(time)
          ))
      ) {
        return res.status(400).json({
          error: 'Each medicine reminder time must use HH:mm format (up to 12 times).',
        });
      }

      if ((startDate && !isRealDate(startDate)) || (endDate && !isRealDate(endDate))) {
        return res.status(400).json({
          error: 'Start and end dates must be valid dates.',
        });
      }

      if (startDate && endDate && endDate < startDate) {
        return res.status(400).json({
          error: 'The end date cannot be before the start date.',
        });
      }

      const medicine = await Medicine.create({
        patientId: req.params.patientId,
        surgeryId: careEpisode.surgery.id,
        careEpisodeId: careEpisode.id,
        doctorId: req.user.id,
        name,
        form: form || 'Tablet',
        dosage,
        frequency,
        times: times || [],
        startDate: startDate || null,
        endDate: endDate || null,
        isActive: true,
      });

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.params.patientId,
        req.user.id,
        'medicine_updated',
        { patientId: req.params.patientId }
      );

      res.status(201).json({ medicine });
    } catch (error) {
      console.error('Medicine creation error:', error);

      res.status(500).json({
        error: 'Unable to create medicine prescription.',
      });
    }
  }
);

router.delete(
  '/patients/:patientId/medicines/:medId',
  async (req, res) => {
    try {
      const careEpisode = await assertActiveMapping(
        req.user.id,
        req.params.patientId,
        res
      );

      if (!careEpisode) return;

      const medicine = await Medicine.findOne({
        where: {
          id: req.params.medId,
          patientId: req.params.patientId,
          surgeryId: careEpisode.surgery.id,
          careEpisodeId: careEpisode.id,
          doctorId: req.user.id,
          isActive: true,
        },
      });

      if (!medicine) {
        return res.status(404).json({ error: 'Medicine not found.' });
      }

      medicine.isActive = false;
      await medicine.save();

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.params.patientId,
        req.user.id,
        'medicine_updated',
        { patientId: req.params.patientId }
      );

      res.json({ message: 'Medicine removed.' });
    } catch (error) {
      console.error('Medicine removal error:', error);

      res.status(500).json({ error: 'Unable to remove medicine.' });
    }
  }
);

/* =========================================================
   FOOD RESTRICTIONS
   ========================================================= */

router.post(
  '/patients/:patientId/food-restrictions',
  async (req, res) => {
    try {
      const careEpisode = await assertActiveMapping(
        req.user.id,
        req.params.patientId,
        res
      );

      if (!careEpisode) return;

      const ingredients =
        typeof req.body.ingredientsToAvoid === 'string'
          ? req.body.ingredientsToAvoid.trim()
          : '';
      const template =
        typeof req.body.dietTemplate === 'string'
          ? req.body.dietTemplate.trim()
          : '';

      if (!ingredients) {
        return res.status(400).json({
          error: 'Please list ingredients to avoid.',
        });
      }

      if (ingredients.length > 2000 || template.length > 100) {
        return res.status(400).json({
          error: 'That restriction is too long.',
        });
      }

      const restriction = await FoodRestriction.create({
        patientId: req.params.patientId,
        surgeryId: careEpisode.surgery.id,
        careEpisodeId: careEpisode.id,
        doctorId: req.user.id,
        dietTemplate: template || null,
        ingredientsToAvoid: ingredients,
      });

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.params.patientId,
        req.user.id,
        'restriction_updated',
        { patientId: req.params.patientId }
      );

      res.status(201).json({ restriction });
    } catch (error) {
      console.error('Food restriction error:', error);

      res.status(500).json({ error: 'Unable to save food restriction.' });
    }
  }
);

/*
 * A restriction entered by mistake has to be removable, otherwise the
 * patient's diet checks enforce it for the rest of the recovery.
 */
router.delete(
  '/patients/:patientId/food-restrictions/:restrictionId',
  async (req, res) => {
    try {
      const careEpisode = await assertActiveMapping(
        req.user.id,
        req.params.patientId,
        res
      );

      if (!careEpisode) return;

      const restriction = await FoodRestriction.findOne({
        where: {
          id: req.params.restrictionId,
          patientId: req.params.patientId,
          careEpisodeId: careEpisode.id,
          doctorId: req.user.id,
        },
      });

      if (!restriction) {
        return res.status(404).json({ error: 'Restriction not found.' });
      }

      await restriction.destroy();

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.params.patientId,
        req.user.id,
        'restriction_updated',
        { patientId: req.params.patientId }
      );

      res.json({ message: 'Restriction removed.' });
    } catch (error) {
      console.error('Food restriction removal error:', error);

      res.status(500).json({ error: 'Unable to remove restriction.' });
    }
  }
);

/* =========================================================
   APPOINTMENTS
   ========================================================= */

router.get(
  '/appointments',
  async (req, res) => {
    try {
      const appointments =
        await Appointment.findAll({
          where: {
            doctorId:
              req.user.id,
          },

          order: [
            ['date', 'DESC'],
            ['time', 'ASC'],
          ],
        });

      const patientIds = [
        ...new Set(
          appointments.map(
            (appointment) =>
              appointment.patientId
          )
        ),
      ];

      const users =
        await User.findAll({
          where: {
            id: patientIds,
          },
        });

      const activeEpisodes =
        await CareEpisode.findAll({
          where: {
            doctorId:
              req.user.id,

            status:
              'active',
          },

          include: [
            {
              model: Surgery,
              as: 'surgery',
            },
          ],
        });

      res.json({
        appointments:
          appointments.map(
            (appointment) => {
              const user =
                users.find(
                  (item) =>
                    item.id ===
                    appointment.patientId
                );

              const episode =
                activeEpisodes.find(
                  (item) =>
                    item.patientId ===
                    appointment.patientId
                );

              return {
                id:
                  appointment.id,

                patientId:
                  appointment.patientId,

                patientName:
                  user?.name ||
                  null,

                surgeryName:
                  episode
                    ?.surgery
                    ?.surgeryName ||
                  null,

                careEpisodeId:
                  episode?.id ||
                  appointment
                    .careEpisodeId ||
                  null,

                visitCategory:
                  appointment
                    .visitCategory,

                serviceType:
                  appointment
                    .serviceType,

                date:
                  appointment.date,

                time:
                  appointment.time,

                status:
                  appointment.status,
              };
            }
          ),
      });
    } catch (error) {
      console.error(
        'Doctor appointments error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load appointments.',
      });
    }
  }
);

/* =========================================================
   OPEN SLOTS
   ========================================================= */

/*
 * The times this doctor can book or move an appointment into on a given
 * day: exactly the slots the administrator published for them. A time is
 * unavailable when it is already taken or has already passed.
 */
router.get(
  '/slots',
  async (req, res) => {
    try {
      const { date, excludeAppointmentId } = req.query;

      if (!isRealDate(date)) {
        return res.status(400).json({
          error: 'A valid date (YYYY-MM-DD) is required.',
        });
      }

      const bookedWhere = {
        doctorId: req.user.id,
        date,
        status: 'upcoming',
      };

      if (excludeAppointmentId) {
        bookedWhere.id = { [Op.ne]: excludeAppointmentId };
      }

      const [slots, booked] = await Promise.all([
        AppointmentSlot.findAll({
          where: { doctorId: req.user.id, date, isActive: true },
          order: [['time', 'ASC']],
        }),
        Appointment.findAll({ where: bookedWhere }),
      ]);

      const taken = new Set(booked.map((item) => item.time));
      const now = nowStamp();

      res.json({
        date,
        slots: slots.map((slot) => ({
          time: slot.time,
          available: !taken.has(slot.time) && stampOf(date, slot.time) > now,
        })),
      });
    } catch (error) {
      console.error('Doctor slots error:', error);

      res.status(500).json({ error: 'Unable to load your open slots.' });
    }
  }
);

/*
 * Which days in a month have at least one bookable slot for this doctor. The
 * follow-up and reschedule calendars use it to enable only workable days.
 */
router.get(
  '/slots/days',
  async (req, res) => {
    try {
      const { month, excludeAppointmentId } = req.query;
      const match = /^(\d{4})-(\d{2})$/.exec(month || '');

      if (!match || Number(match[2]) < 1 || Number(match[2]) > 12) {
        return res.status(400).json({ error: 'A valid month (YYYY-MM) is required.' });
      }

      const lastDay = new Date(Date.UTC(Number(match[1]), Number(match[2]), 0)).getUTCDate();
      const range = { [Op.between]: [`${month}-01`, `${month}-${String(lastDay).padStart(2, '0')}`] };

      const bookedWhere = { doctorId: req.user.id, date: range, status: 'upcoming' };

      if (excludeAppointmentId) {
        bookedWhere.id = { [Op.ne]: excludeAppointmentId };
      }

      const [slots, booked] = await Promise.all([
        AppointmentSlot.findAll({ where: { doctorId: req.user.id, date: range, isActive: true } }),
        Appointment.findAll({ where: bookedWhere }),
      ]);

      const taken = new Set(booked.map((item) => `${item.date} ${item.time}`));
      const now = nowStamp();

      const days = [
        ...new Set(
          slots
            .filter((slot) => !taken.has(`${slot.date} ${slot.time}`) && stampOf(slot.date, slot.time) > now)
            .map((slot) => slot.date)
        ),
      ].sort();

      res.json({ month, days });
    } catch (error) {
      console.error('Doctor slot days error:', error);

      res.status(500).json({ error: 'Unable to load your open days.' });
    }
  }
);

/* =========================================================
   COMPLETE APPOINTMENT
   ========================================================= */

router.patch(
  '/appointments/:id/complete',
  async (req, res) => {
    try {
      const appointment = await Appointment.findOne({
        where: { id: req.params.id, doctorId: req.user.id },
      });

      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found.' });
      }

      if (!['upcoming'].includes(appointment.status)) {
        return res.status(400).json({
          error: 'Only upcoming appointments can be completed.',
        });
      }

      // Only after the appointment's time slot has passed.
      if (stampOf(appointment.date, appointment.time) > nowStamp()) {
        return res.status(400).json({
          error: 'You can mark this appointment completed once its time slot has passed.',
        });
      }

      appointment.status = 'completed';
      appointment.completedAt = new Date();
      await appointment.save();

      notifyPatientAndDoctor(
        req.app.get('io'),
        appointment.patientId,
        req.user.id,
        'appointment_completed',
        { appointment }
      );

      res.json({ message: 'Appointment marked as completed.' });
    } catch (error) {
      console.error('Appointment completion error:', error);

      res.status(500).json({ error: 'Unable to complete appointment.' });
    }
  }
);

/* =========================================================
   CANCEL APPOINTMENT
   ========================================================= */

router.patch(
  '/appointments/:id/cancel',
  async (req, res) => {
    try {
      const appointment = await Appointment.findOne({
        where: { id: req.params.id, doctorId: req.user.id },
      });

      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found.' });
      }

      if (appointment.status !== 'upcoming') {
        return res.status(400).json({
          error: 'Only upcoming appointments can be cancelled.',
        });
      }

      appointment.status = 'cancelled';
      appointment.cancelledAt = new Date();
      await appointment.save();

      // The time is free again: bookings only count upcoming appointments.
      notifyPatientAndDoctor(
        req.app.get('io'),
        appointment.patientId,
        req.user.id,
        'appointment_cancelled',
        { appointment }
      );

      res.json({ message: 'Appointment cancelled.' });
    } catch (error) {
      console.error('Appointment cancellation error:', error);

      res.status(500).json({ error: 'Unable to cancel appointment.' });
    }
  }
);

/* =========================================================
   RESCHEDULE APPOINTMENT
   ========================================================= */

router.patch(
  '/appointments/:id/reschedule',
  async (req, res) => {
    try {
      const { date, time } = req.body;

      if (!date || !time) {
        return res.status(400).json({ error: 'Date and time are required.' });
      }

      const appointment = await Appointment.findOne({
        where: { id: req.params.id, doctorId: req.user.id },
      });

      if (!appointment) {
        return res.status(404).json({ error: 'Appointment not found.' });
      }

      // Completed and cancelled appointments are history; they can't be revived.
      if (appointment.status !== 'upcoming') {
        return res.status(400).json({
          error: 'Only upcoming appointments can be rescheduled.',
        });
      }

      const problem = await validateScheduleTime(req.user.id, date, time);

      if (problem) {
        return res.status(400).json({ error: problem });
      }

      const doctorConflict = await hasDoctorConflict(
        req.user.id,
        date,
        time,
        appointment.id
      );

      if (doctorConflict) {
        return res.status(409).json({
          error: 'You already have an appointment at this date and time.',
          conflictType: 'doctor',
          conflictingAppointmentId: doctorConflict.id,
        });
      }

      const patientConflict = await hasPatientConflict(
        appointment.patientId,
        date,
        time,
        appointment.id
      );

      if (patientConflict) {
        return res.status(409).json({
          error: 'The patient already has an appointment at this date and time.',
          conflictType: 'patient',
          conflictingAppointmentId: patientConflict.id,
        });
      }

      appointment.date = date;
      appointment.time = time;
      await appointment.save();

      notifyPatientAndDoctor(
        req.app.get('io'),
        appointment.patientId,
        req.user.id,
        'appointment_rescheduled',
        { appointment }
      );

      res.json({ message: 'Appointment rescheduled.', appointment });
    } catch (error) {
      if (respondIfSlotTaken(error, res)) return;

      console.error('Appointment reschedule error:', error);

      res.status(500).json({ error: 'Unable to reschedule appointment.' });
    }
  }
);

/* =========================================================
   DOCTOR CREATES FOLLOW-UP
   ========================================================= */

router.post(
  '/patients/:patientId/appointments',
  async (req, res) => {
    try {
      const careEpisode = await assertActiveMapping(
        req.user.id,
        req.params.patientId,
        res
      );

      if (!careEpisode) return;

      const { visitCategory, serviceType, date, time, notes } = req.body;

      if (!visitCategory || !serviceType || !date || !time) {
        return res.status(400).json({
          error: 'Visit category, service type, date, and time are required.',
        });
      }

      if (!isValidVisitSelection(visitCategory, serviceType)) {
        return res.status(400).json({
          error: 'Invalid visit category or service type.',
        });
      }

      const note = typeof notes === 'string' ? notes.trim() : '';

      if (note.length > 255) {
        return res.status(400).json({
          error: 'Notes can be up to 255 characters.',
        });
      }

      const problem = await validateScheduleTime(req.user.id, date, time);

      if (problem) {
        return res.status(400).json({ error: problem });
      }

      const doctorConflict = await hasDoctorConflict(req.user.id, date, time);

      if (doctorConflict) {
        return res.status(409).json({
          error: 'You already have an appointment at this date and time.',
          conflictType: 'doctor',
          conflictingAppointmentId: doctorConflict.id,
        });
      }

      const patientConflict = await hasPatientConflict(
        req.params.patientId,
        date,
        time
      );

      if (patientConflict) {
        return res.status(409).json({
          error: 'The patient already has an appointment at this date and time.',
          conflictType: 'patient',
          conflictingAppointmentId: patientConflict.id,
        });
      }

      const appointment = await Appointment.create({
        patientId: req.params.patientId,
        doctorId: req.user.id,
        careEpisodeId: careEpisode.id,
        visitCategory,
        serviceType,
        date,
        time,
        notes: note || null,
        status: 'upcoming',
      });

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.params.patientId,
        req.user.id,
        'appointment_created',
        { appointment }
      );

      res.status(201).json({ appointment });
    } catch (error) {
      if (respondIfSlotTaken(error, res)) return;

      console.error('Doctor appointment creation error:', error);

      res.status(500).json({ error: 'Unable to create appointment.' });
    }
  }
);

/* =========================================================
   PRIORITY INBOX
   ========================================================= */

/* Open chats where the patient spoke last: the doctor's turn to reply. */
async function countAwaitingReply(doctorId) {
  const threads = await ChatThread.findAll({
    where: { doctorId, status: 'open' },
    attributes: ['id'],
  });

  if (!threads.length) return 0;

  const messages = await ChatMessage.findAll({
    where: { threadId: threads.map((thread) => thread.id) },
    attributes: ['threadId', 'senderRole', 'createdAt'],
    order: [['createdAt', 'DESC']],
  });

  const lastRole = new Map();
  messages.forEach((message) => {
    if (!lastRole.has(message.threadId)) lastRole.set(message.threadId, message.senderRole);
  });

  return [...lastRole.values()].filter((role) => role === 'patient').length;
}

router.get(
  '/inbox/summary',
  async (req, res) => {
    try {
      res.json({ awaitingReply: await countAwaitingReply(req.user.id) });
    } catch (error) {
      console.error('Inbox summary error:', error);

      res.status(500).json({ error: 'Unable to load inbox summary.' });
    }
  }
);

router.get(
  '/inbox',
  async (req, res) => {
    try {
      // ?status=closed lists archived chats (newest first); default is open chats.
      const closed = req.query.status === 'closed';

      const threads = await ChatThread.findAll({
        where: { doctorId: req.user.id, status: closed ? 'closed' : 'open' },
        order: closed ? [['closedAt', 'DESC'], ['createdAt', 'DESC']] : [['createdAt', 'DESC']],
        limit: closed ? 100 : undefined,
      });

      const threadIds = threads.map((thread) => thread.id);
      const patientIds = [...new Set(threads.map((thread) => thread.patientId))];

      const [users, messages, episodes] = await Promise.all([
        User.findAll({ where: { id: patientIds } }),
        threadIds.length
          ? ChatMessage.findAll({
              where: { threadId: threadIds },
              order: [['createdAt', 'DESC']],
            })
          : [],
        CareEpisode.findAll({
          where: { doctorId: req.user.id, patientId: patientIds },
          include: [{ model: Surgery, as: 'surgery' }],
          order: [['createdAt', 'DESC']],
        }),
      ]);

      const lastByThread = new Map();
      const countByThread = new Map();
      messages.forEach((message) => {
        if (!lastByThread.has(message.threadId)) lastByThread.set(message.threadId, message);
        countByThread.set(message.threadId, (countByThread.get(message.threadId) || 0) + 1);
      });

      const items = threads.map((thread) => {
        const last = lastByThread.get(thread.id) || null;
        // The recovery this chat belonged to, else the patient's most recent one.
        const episode =
          episodes.find((item) => item.id === thread.careEpisodeId) ||
          episodes.find((item) => item.patientId === thread.patientId);

        return {
          id: thread.id,
          chatCode: thread.chatCode,
          status: thread.status,
          patientId: thread.patientId,
          patientName: users.find((user) => user.id === thread.patientId)?.name || null,
          surgeryName: episode?.surgery?.surgeryName || null,
          createdAt: thread.createdAt,
          closedAt: thread.closedAt || null,
          messageCount: countByThread.get(thread.id) || 0,
          lastActivityAt: last ? last.createdAt : thread.createdAt,
          lastMessage: last
            ? {
                senderRole: last.senderRole,
                content: String(last.content || '').slice(0, 140),
                createdAt: last.createdAt,
              }
            : null,
          // The patient spoke last, so it's the doctor's turn.
          awaitingReply: !closed && Boolean(last && last.senderRole === 'patient'),
        };
      });

      items.sort((a, b) => new Date(b.lastActivityAt) - new Date(a.lastActivityAt));

      res.json({ threads: items });
    } catch (error) {
      console.error('Priority inbox error:', error);

      res.status(500).json({ error: 'Unable to load priority inbox.' });
    }
  }
);

router.get(
  '/inbox/:threadId/messages',
  async (req, res) => {
    try {
      const thread =
        await ChatThread.findOne({
          where: {
            id:
              req.params.threadId,

            doctorId:
              req.user.id,
          },
        });

      if (!thread) {
        return res.status(404).json({
          error:
            'Chat not found.',
        });
      }

      const messages =
        await ChatMessage.findAll({
          where: {
            threadId:
              thread.id,
          },

          order: [
            ['createdAt', 'ASC'],
          ],
        });

      res.json({
        thread: {
          id:
            thread.id,

          chatCode:
            thread.chatCode,

          status:
            thread.status,
        },

        messages,
      });
    } catch (error) {
      console.error(
        'Priority messages error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load chat messages.',
      });
    }
  }
);

router.post(
  '/inbox/:threadId/messages',
  async (req, res) => {
    try {
      const thread =
        await ChatThread.findOne({
          where: {
            id:
              req.params.threadId,

            doctorId:
              req.user.id,

            status:
              'open',
          },
        });

      if (!thread) {
        return res.status(404).json({
          error:
            'This chat is not open.',
        });
      }

      const content =
        typeof req.body.content ===
        'string'
          ? req.body.content.trim()
          : '';

      if (!content) {
        return res.status(400).json({
          error:
            'Message cannot be empty.',
        });
      }

      if (content.length > 2000) {
        return res.status(400).json({
          error: 'Messages can be up to 2000 characters.',
        });
      }

      const message =
        await ChatMessage.create({
          threadId:
            thread.id,

          senderRole:
            'doctor',

          content,
        });

      req.app
        .get('io')
        ?.to(
          `thread_${thread.id}`
        )
        .emit(
          'new_message',
          message
        );

      res.status(201).json({
        message,
      });
    } catch (error) {
      console.error(
        'Doctor chat message error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to send message.',
      });
    }
  }
);

router.patch(
  '/inbox/:threadId/close',
  async (req, res) => {
    try {
      const thread = await ChatThread.findOne({
        where: { id: req.params.threadId, doctorId: req.user.id },
      });

      if (!thread) {
        return res.status(404).json({ error: 'Chat not found.' });
      }

      // Closing twice must not rewrite the archive timestamp.
      if (thread.status !== 'closed') {
        thread.status = 'closed';
        thread.closedAt = new Date();
        await thread.save();

        const io = req.app.get('io');
        io?.to(`thread_${thread.id}`).emit('chat_closed', { threadId: thread.id });
        notifyUser(io, thread.patientId, 'chat_closed', { threadId: thread.id });
      }

      res.json({
        message: 'Chat closed and archived to the patient file.',
      });
    } catch (error) {
      console.error('Close chat error:', error);

      res.status(500).json({ error: 'Unable to close chat.' });
    }
  }
);

/* =========================================================
   PATIENT CHAT HISTORY (ARCHIVED/CLOSED THREADS)
   ========================================================= */

/*
 * Closed Priority Inbox threads are kept (not deleted) for
 * legal/compliance reasons, but until now there was no route
 * anywhere that ever returned them - the data survived in the
 * database but was otherwise unreachable through the app.
 *
 * Unlike the main patient-details route, this deliberately
 * does NOT require an *active* CareEpisode. The whole point of
 * retaining a closed chat is so the treating doctor can look
 * back on it later, including after the patient has been
 * discharged - so access here is instead scoped to "has this
 * doctor ever had a care episode with this patient", which
 * still prevents a doctor from browsing patients they were
 * never assigned to, without cutting them off from their own
 * past records the moment recovery ends.
 */
router.get(
  '/patients/:patientId/chat-history',
  async (req, res) => {
    try {
      const everCared =
        await CareEpisode.findOne({
          where: {
            doctorId:
              req.user.id,

            patientId:
              req.params.patientId,
          },
        });

      if (!everCared) {
        return res.status(403).json({
          error:
            'This patient has never been under your care.',
        });
      }

      const threads =
        await ChatThread.findAll({
          where: {
            doctorId:
              req.user.id,

            patientId:
              req.params.patientId,

            status:
              'closed',
          },

          order: [
            ['closedAt', 'DESC'],
            ['createdAt', 'DESC'],
          ],
        });

      const threadIds =
        threads.map(
          (thread) => thread.id
        );

      const messages =
        threadIds.length
          ? await ChatMessage.findAll({
              where: {
                threadId:
                  threadIds,
              },

              order: [
                ['createdAt', 'ASC'],
              ],
            })
          : [];

      res.json({
        threads:
          threads.map(
            (thread) => ({
              id:
                thread.id,

              chatCode:
                thread.chatCode,

              status:
                thread.status,

              createdAt:
                thread.createdAt,

              closedAt:
                thread.closedAt,

              messages:
                messages
                  .filter(
                    (message) =>
                      message
                        .threadId ===
                      thread.id
                  )
                  .map(
                    (message) => ({
                      id:
                        message.id,

                      senderRole:
                        message
                          .senderRole,

                      content:
                        message.content,

                      createdAt:
                        message.createdAt,
                    })
                  ),
            })
          ),
      });
    } catch (error) {
      console.error(
        'GET /doctor/patients/:patientId/chat-history error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load chat history.',
      });
    }
  }
);

module.exports = router;