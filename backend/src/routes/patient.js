const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');

const sequelize = require('../config/db');

const {
  authenticate,
  requireRole,
} = require('../middleware/auth');

const {
  uploadProfilePhoto,
} = require('../middleware/upload');

const {
  User,
  PatientProfile,
  Surgery,
  CareEpisode,
  MedicalFile,
  Medicine,
  FoodRestriction,
  Appointment,
  SOSAlert,
  DoctorProfile,
  ChatThread,
  ChatMessage,
  VitalsAssessment,
  AppointmentSlot,
} = require('../models');

const {
  generateChatCode,
} = require('../utils/idGenerator');

const {
  notifyUser,
  notifyDoctor,
  notifyAdmins,
  notifyPatientAndDoctor,
} = require('../utils/realtime');

const {
  computeRecovery,
} = require('../utils/recovery');

const {
  kingslayerReply,
  checkFoodSafety,
} = require('../utils/llmEngine');

const {
  scoreVitals,
  computeTrend,
  getMonitoringMessage,
} = require('../utils/anomalyEngine');

const router = express.Router();

router.use(
  authenticate,
  requireRole('patient')
);

/* =========================================================
   HELPERS
   ========================================================= */

async function getActiveCareEpisode(patientId) {
  return CareEpisode.findOne({
    where: {
      patientId,
      status: 'active',
    },

    include: [
      {
        model: Surgery,
        as: 'surgery',
      },
    ],

    order: [
      ['createdAt', 'DESC'],
    ],
  });
}

async function getActiveSurgery(patientId) {
  const episode =
    await getActiveCareEpisode(
      patientId
    );

  if (!episode) {
    return null;
  }

  return episode.surgery || null;
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(
    String(value || '')
  );
}

function normalizeRecoveryDays(value) {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return 14;
  }

  const days = Number(value);

  if (
    !Number.isInteger(days) ||
    days < 1 ||
    days > 365
  ) {
    return null;
  }

  return days;
}

function isValidTime(value) {
  return /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(
    String(value || '')
  );
}

function normalizeStatusValues() {
  return [
    'scheduled',
    'upcoming',
  ];
}

async function hasPatientAppointmentConflict(
  patientId,
  date,
  time,
  excludeId = null
) {
  const where = {
    patientId,
    date,
    time,

    status: {
      [Op.in]:
        normalizeStatusValues(),
    },
  };

  if (excludeId) {
    where.id = {
      [Op.ne]:
        excludeId,
    };
  }

  const existing =
    await Appointment.findOne({
      where,
    });

  return !!existing;
}

async function hasDoctorAppointmentConflict(
  doctorId,
  date,
  time,
  excludeId = null
) {
  const where = {
    doctorId,
    date,
    time,

    status: {
      [Op.in]:
        normalizeStatusValues(),
    },
  };

  if (excludeId) {
    where.id = {
      [Op.ne]:
        excludeId,
    };
  }

  const existing =
    await Appointment.findOne({
      where,
    });

  return !!existing;
}

/* =========================================================
   HOME
   ========================================================= */

router.get(
  '/home',
  async (req, res) => {
    try {
      const patientId =
        req.user.id;

      const episode =
        await getActiveCareEpisode(
          patientId
        );

      const upcoming =
        await Appointment.findOne({
          where: {
            patientId,

            status: {
              [Op.in]:
                normalizeStatusValues(),
            },
          },

          order: [
            ['date', 'ASC'],
            ['time', 'ASC'],
          ],
        });

      let upcomingWithDoctor =
        null;

      if (upcoming) {
        const [
          doctor,
          doctorProfile,
        ] = await Promise.all([
          User.findByPk(
            upcoming.doctorId
          ),

          DoctorProfile.findOne({
            where: {
              userId:
                upcoming.doctorId,
            },
          }),
        ]);

        upcomingWithDoctor = {
          id:
            upcoming.id,

          date:
            upcoming.date,

          time:
            upcoming.time,

          status:
            upcoming.status,

          doctorName:
            doctor?.name ||
            null,

          specialization:
            doctorProfile
              ?.specialization ||
            null,

          visitCategory:
            upcoming.visitCategory,

          serviceType:
            upcoming.serviceType,
        };
      }

      const medicines =
        episode
          ? await Medicine.findAll({
              where: {
                patientId,

                careEpisodeId:
                  episode.id,

                isActive:
                  true,
              },

              order: [
                ['createdAt', 'DESC'],
              ],
            })
          : [];

      res.json({
        hasActiveCareEpisode:
          !!episode,

        hasActiveSurgery:
          !!episode?.surgery,

        doctorId:
          episode?.doctorId ||
          null,

        activeCareEpisode:
          episode
            ? {
                id:
                  episode.id,

                doctorId:
                  episode.doctorId,

                surgeryId:
                  episode.surgeryId,

                status:
                  episode.status,

                startDate:
                  episode.startDate,

                expectedRecoveryDays:
                  episode
                    .expectedRecoveryDays,

                daysRemaining:
                  computeRecovery(
                    episode.startDate,
                    episode
                      .expectedRecoveryDays
                  ).daysRemaining,
              }
            : null,

        upcomingAppointment:
          upcomingWithDoctor,

        medicineReminders:
          medicines.map(
            (medicine) => ({
              id:
                medicine.id,

              name:
                medicine.name,

              dosage:
                medicine.dosage,

              frequency:
                medicine.frequency,

              times:
                medicine.times,
            })
          ),
      });
    } catch (error) {
      console.error(
        'GET /patient/home error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to load patient home.',
      });
    }
  }
);

/* =========================================================
   CARE EPISODES — RE-ADMISSION AFTER DISCHARGE
   ========================================================= */

/*
 * A CareEpisode is a TEMPORARY doctor <-> patient recovery
 * relationship, not a permanent account-level link (see
 * models/index.js). Once discharged, the existing account
 * has no active episode and, previously, no way to ever get
 * a new one - signup only creates brand-new accounts and
 * email must stay unique, so a returning patient could not
 * be re-admitted for a new surgery under a new (or the same)
 * doctor.
 *
 * This lets an already-authenticated patient start a new
 * episode themselves, using the same "surgeon hands me a
 * Doctor ID" pattern as the original signup flow. It is only
 * available while the patient has no active episode, so a
 * patient can never be mapped to two doctors at once.
 */
router.post(
  '/care-episodes',
  async (req, res) => {
    const transaction =
      await sequelize.transaction();

    try {
      const existingEpisode =
        await getActiveCareEpisode(
          req.user.id
        );

      if (existingEpisode) {
        await transaction.rollback();

        return res.status(409).json({
          error:
            'You already have an active recovery episode. Discharge is required before starting a new one.',
        });
      }

      const {
        doctorUniqueId,
        surgeryName,
        recoveryTotalDays,
      } = req.body;

      const normalizedDoctorId =
        typeof doctorUniqueId ===
        'string'
          ? doctorUniqueId
              .trim()
              .toUpperCase()
          : '';

      const normalizedSurgeryName =
        typeof surgeryName ===
        'string'
          ? surgeryName.trim()
          : '';

      if (!normalizedDoctorId) {
        await transaction.rollback();

        return res.status(400).json({
          error:
            'Doctor ID is required.',
        });
      }

      if (!normalizedSurgeryName) {
        await transaction.rollback();

        return res.status(400).json({
          error:
            'Surgery name is required.',
        });
      }

      const recoveryDays =
        normalizeRecoveryDays(
          recoveryTotalDays
        );

      if (recoveryDays === null) {
        await transaction.rollback();

        return res.status(400).json({
          error:
            'Recovery duration must be a whole number between 1 and 365 days.',
        });
      }

      const doctorProfile =
        await DoctorProfile.findOne({
          where: {
            uniqueDoctorId:
              normalizedDoctorId,
          },
        });

      if (!doctorProfile) {
        await transaction.rollback();

        return res.status(404).json({
          error:
            'That doctor ID was not recognized. Please double-check it with your surgeon.',
        });
      }

      const doctor =
        await User.findOne({
          where: {
            id:
              doctorProfile.userId,
            role: 'doctor',
          },
        });

      if (!doctor || !doctor.isActive) {
        await transaction.rollback();

        return res.status(403).json({
          error:
            'This doctor account is currently unavailable. Please contact the hospital.',
        });
      }

      const surgery =
        await Surgery.create(
          {
            patientId:
              req.user.id,

            doctorId:
              doctor.id,

            surgeryName:
              normalizedSurgeryName,

            recoveryTotalDays:
              recoveryDays,

            recoveryDaysRemaining:
              recoveryDays,

            startDate:
              new Date()
                .toISOString()
                .slice(0, 10),

            status: 'active',
          },
          { transaction }
        );

      const careEpisode =
        await CareEpisode.create(
          {
            patientId:
              req.user.id,

            doctorId:
              doctor.id,

            surgeryId:
              surgery.id,

            status: 'active',

            startDate:
              surgery.startDate,

            expectedRecoveryDays:
              recoveryDays,

            daysRemaining:
              recoveryDays,
          },
          { transaction }
        );

      await transaction.commit();

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.user.id,
        doctor.id,
        'recovery_updated',
        { careEpisode }
      );

      return res.status(201).json({
        message:
          'New recovery episode started.',

        surgery: {
          id: surgery.id,
          surgeryName:
            surgery.surgeryName,
          status: surgery.status,
          recoveryTotalDays:
            surgery.recoveryTotalDays,
          recoveryDaysRemaining:
            surgery.recoveryDaysRemaining,
        },

        careEpisode: {
          id: careEpisode.id,
          doctorId:
            careEpisode.doctorId,
          surgeryId:
            careEpisode.surgeryId,
          status:
            careEpisode.status,
          startDate:
            careEpisode.startDate,
          expectedRecoveryDays:
            careEpisode.expectedRecoveryDays,
          daysRemaining:
            computeRecovery(
              careEpisode.startDate,
              careEpisode
                .expectedRecoveryDays
            ).daysRemaining,
        },
      });
    } catch (error) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error(
          'Care episode transaction rollback error:',
          rollbackError
        );
      }

      console.error(
        'POST /patient/care-episodes error:',
        error
      );

      return res.status(500).json({
        error:
          'Unable to start a new recovery episode.',
      });
    }
  }
);

/* =========================================================
   SOS
   ========================================================= */

router.post(
  '/sos',
  async (req, res) => {
    try {
      const patientId =
        req.user.id;

      const episode =
        await getActiveCareEpisode(
          patientId
        );

      if (
        !episode ||
        !episode.surgery
      ) {
        return res.status(400).json({
          message:
            'No active recovery episode is available for emergency escalation.',
        });
      }

      const doctorId =
        episode.doctorId;

      const [
        patient,
        patientProfile,
        doctor,
      ] = await Promise.all([
        User.findByPk(
          patientId
        ),

        PatientProfile.findOne({
          where: {
            userId:
              patientId,
          },
        }),

        User.findByPk(
          doctorId,
          {
            include: [
              {
                model:
                  DoctorProfile,

                as:
                  'doctorProfile',
              },
            ],
          }
        ),
      ]);

      if (!patient) {
        return res.status(404).json({
          message:
            'Patient account not found.',
        });
      }

      /*
       * A deactivated doctor account must be treated the same
       * as an off-duty one for SOS routing purposes - otherwise
       * the alert is created as "pending" against a doctor who
       * can no longer log in to see it, and it never reaches
       * anyone (not the doctor, not the admin escalation queue).
       */
      const isDoctorOnDuty =
        Boolean(
          doctor?.isActive
        ) &&
        doctor
          ?.doctorProfile
          ?.dutyStatus ===
        'on_duty';

      const alert =
        await SOSAlert.create({
          patientId,

          doctorId,

          careEpisodeId:
            episode.id,

          status:
            isDoctorOnDuty
              ? 'pending'
              : 'escalated',

          patientNameSnapshot:
            patient.name ||
            null,

          surgerySnapshot:
            episode.surgery
              .surgeryName ||
            null,

          bloodGroupSnapshot:
            patientProfile
              ?.bloodGroup ||
            null,

          escalatedAt:
            isDoctorOnDuty
              ? null
              : new Date(),
        });

      const io =
        req.app.get('io');

      if (
        isDoctorOnDuty
      ) {
        notifyDoctor(
          io,
          doctorId,
          'sos_created',
          { alert }
        );
      } else {
        notifyAdmins(
          io,
          'sos_created',
          { alert }
        );
      }

      return res.status(201).json({
        message:
          isDoctorOnDuty
            ? 'Emergency alert sent to your on-duty doctor.'
            : 'Your doctor is currently off duty. The emergency alert has been escalated for administrative attention.',

        alert: {
          id:
            alert.id,

          patientId:
            alert.patientId,

          doctorId:
            alert.doctorId,

          careEpisodeId:
            alert.careEpisodeId,

          status:
            alert.status,

          patientNameSnapshot:
            alert.patientNameSnapshot,

          surgerySnapshot:
            alert.surgerySnapshot,

          bloodGroupSnapshot:
            alert.bloodGroupSnapshot,

          escalatedAt:
            alert.escalatedAt,

          createdAt:
            alert.createdAt,

          updatedAt:
            alert.updatedAt,
        },
      });
    } catch (error) {
      console.error(
        'POST /patient/sos error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to send emergency alert.',
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
      const patientId =
        req.user.id;

      const [
        user,
        profile,
        surgeries,
        activeEpisode,
      ] = await Promise.all([
        User.findByPk(
          patientId
        ),

        PatientProfile.findOne({
          where: {
            userId:
              patientId,
          },
        }),

        Surgery.findAll({
          where: {
            patientId,
          },

          order: [
            ['startDate', 'DESC'],
            ['createdAt', 'DESC'],
          ],
        }),

        getActiveCareEpisode(
          patientId
        ),
      ]);

      if (!user) {
        return res.status(404).json({
          message:
            'Patient account not found.',
        });
      }

      const doctorIds = [
        ...new Set(
          surgeries
            .map(
              (surgery) =>
                surgery.doctorId
            )
            .filter(Boolean)
        ),
      ];

      const doctors =
        doctorIds.length
          ? await User.findAll({
              where: {
                id:
                  doctorIds,
              },
            })
          : [];

      res.json({
        name:
          user.name,

        email:
          user.email,

        phone:
          user.phone,

        photoUrl:
          user.photoUrl,

        address:
          profile?.address ||
          null,

        bloodGroup:
          profile?.bloodGroup ||
          null,

        dateOfBirth:
          profile?.dateOfBirth ||
          null,

        gender:
          profile?.gender ||
          null,

        emergencyContact:
          profile?.emergencyContact ||
          null,

        allergies:
          profile?.allergies ||
          null,

        activeCareEpisode:
          activeEpisode
            ? {
                id:
                  activeEpisode.id,

                doctorId:
                  activeEpisode
                    .doctorId,

                surgeryId:
                  activeEpisode
                    .surgeryId,

                status:
                  activeEpisode.status,

                startDate:
                  activeEpisode.startDate,

                expectedRecoveryDays:
                  activeEpisode
                    .expectedRecoveryDays,

                daysRemaining:
                  computeRecovery(
                    activeEpisode.startDate,
                    activeEpisode
                      .expectedRecoveryDays
                  ).daysRemaining,
              }
            : null,

        surgeryLedger:
          surgeries.map(
            (surgery) => ({
              id:
                surgery.id,

              surgeryName:
                surgery.surgeryName,

              status:
                surgery.status,

              startDate:
                surgery.startDate,

              surgeryDate:
                surgery.surgeryDate,

              dischargeDate:
                surgery.dischargeDate,

              description:
                surgery.description,

              recoveryTotalDays:
                surgery
                  .recoveryTotalDays,

              /*
               * Completed/discharged surgeries keep the value
               * recorded at discharge time - that is historical
               * fact and must not be recomputed. Only a still-
               * active surgery's remaining days are derived live
               * from the calendar.
               */
              recoveryDaysRemaining:
                surgery.status ===
                'active'
                  ? computeRecovery(
                      surgery.startDate,
                      surgery
                        .recoveryTotalDays
                    ).daysRemaining
                  : surgery
                      .recoveryDaysRemaining,

              doctorName:
                doctors.find(
                  (doctor) =>
                    doctor.id ===
                    surgery.doctorId
                )?.name ||
                null,
            })
          ),
      });
    } catch (error) {
      console.error(
        'GET /patient/profile error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to load patient profile.',
      });
    }
  }
);

router.put(
  '/profile',
  async (req, res) => {
    try {
      const {
        name,
        phone,
        address,
        bloodGroup,
        dateOfBirth,
        gender,
        emergencyContact,
        allergies,
      } = req.body;

      const [
        user,
        profile,
      ] = await Promise.all([
        User.findByPk(
          req.user.id
        ),

        PatientProfile.findOne({
          where: {
            userId:
              req.user.id,
          },
        }),
      ]);

      if (
        !user ||
        !profile
      ) {
        return res.status(404).json({
          message:
            'Patient profile not found.',
        });
      }

      if (
        name !== undefined
      ) {
        user.name =
          String(
            name
          ).trim();
      }

      if (
        phone !== undefined
      ) {
        user.phone =
          phone;
      }

      await user.save();

      Object.assign(
        profile,
        {
          ...(address !== undefined &&
            {
              address,
            }),

          ...(bloodGroup !==
            undefined && {
              bloodGroup,
            }),

          ...(dateOfBirth !==
            undefined && {
              dateOfBirth,
            }),

          ...(gender !==
            undefined && {
              gender,
            }),

          ...(emergencyContact !==
            undefined && {
              emergencyContact,
            }),

          ...(allergies !==
            undefined && {
              allergies,
            }),
        }
      );

      await profile.save();

      res.json({
        message:
          'Profile updated.',
      });
    } catch (error) {
      console.error(
        'PUT /patient/profile error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to update patient profile.',
      });
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
            'Patient account not found.',
        });
      }

      user.photoUrl =
        `/uploads/profile_photos/${req.file.filename}`;

      await user.save();

      res.json({
        photoUrl:
          user.photoUrl,
      });
    } catch (error) {
      console.error(
        'POST /patient/profile/photo error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to upload profile photo.',
      });
    }
  }
);

/* =========================================================
   LAB REPORTS
   ========================================================= */

router.post(
  '/lab-reports/verify',
  async (req, res) => {
    try {
      const {
        password,
      } = req.body;

      const user =
        await User.findByPk(
          req.user.id
        );

      if (!user) {
        return res.status(404).json({
          error:
            'Patient account not found.',
        });
      }

      if (
        typeof password !==
          'string' ||
        !password
      ) {
        return res.status(400).json({
          error:
            'Password is required.',
        });
      }

      const valid =
        await bcrypt.compare(
          password,
          user.passwordHash
        );

      if (!valid) {
        return res.status(401).json({
          error:
            'Incorrect password.',
        });
      }

      const stepUpToken =
        jwt.sign(
          {
            userId:
              req.user.id,

            purpose:
              'lab_reports',
          },
          process.env.JWT_SECRET,
          {
            expiresIn:
              '5m',
          }
        );

      return res.json({
        verified:
          true,

        stepUpToken,

        expiresInSeconds:
          300,
      });
    } catch (error) {
      console.error(
        'POST /patient/lab-reports/verify error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to verify access.',
      });
    }
  }
);

router.get(
  '/lab-reports',
  async (req, res) => {
    try {
      const stepUpToken =
        req.get(
          'X-Step-Up-Token'
        );

      if (!stepUpToken) {
        return res.status(401).json({
          error:
            'Lab Reports access requires password verification.',
        });
      }

      let payload;

      try {
        payload =
          jwt.verify(
            stepUpToken,
            process.env.JWT_SECRET
          );
      } catch (error) {
        return res.status(401).json({
          error:
            'Lab Reports verification has expired. Please re-enter your password.',
        });
      }

      if (
        payload.purpose !==
          'lab_reports' ||
        payload.userId !==
          req.user.id
      ) {
        return res.status(403).json({
          error:
            'Invalid Lab Reports verification.',
        });
      }

      const surgeries =
        await Surgery.findAll({
          where: {
            patientId:
              req.user.id,
          },
        });

      const surgeryIds =
        surgeries.map(
          (surgery) =>
            surgery.id
        );

      if (
        !surgeryIds.length
      ) {
        return res.json({
          files: [],
        });
      }

      const files =
        await MedicalFile.findAll({
          where: {
            patientId:
              req.user.id,

            surgeryId:
              surgeryIds,
          },

          order: [
            ['createdAt', 'DESC'],
          ],
        });

      return res.json({
        files,
      });
    } catch (error) {
      console.error(
        'GET /patient/lab-reports error:',
        error
      );

      return res.status(500).json({
        message:
          'Failed to load lab reports.',
      });
    }
  }
);

/* =========================================================
   APPOINTMENTS
   ========================================================= */

/*
 * Returns the hospital's admin-defined slot times for a given
 * date, each flagged as available or already taken - "taken"
 * meaning the patient's own current doctor already has an
 * upcoming appointment at that exact date+time with someone.
 * The patient picks one of these rather than typing a free-form
 * time, and the booking route below only accepts a time that
 * appears here as available.
 */
router.get(
  '/appointments/available-slots',
  async (req, res) => {
    try {
      const { date } = req.query;

      if (!isValidDate(date)) {
        return res.status(400).json({
          error: 'A valid date (YYYY-MM-DD) is required.',
        });
      }

      const episode = await getActiveCareEpisode(req.user.id);

      if (!episode) {
        return res.status(403).json({
          error: 'You have no active recovery episode to book an appointment for.',
        });
      }

      const [slotTimes, bookedAppointments] = await Promise.all([
        AppointmentSlot.findAll({
          where: { isActive: true },
          order: [['time', 'ASC']],
        }),

        Appointment.findAll({
          where: {
            doctorId: episode.doctorId,
            date,
            status: 'upcoming',
          },
        }),
      ]);

      const bookedTimes = new Set(bookedAppointments.map((appt) => appt.time));

      const slots = slotTimes.map((slot) => ({
        time: slot.time,
        available: !bookedTimes.has(slot.time),
      }));

      res.json({ date, doctorId: episode.doctorId, slots });
    } catch (error) {
      console.error('GET /patient/appointments/available-slots error:', error);

      res.status(500).json({
        error: 'Unable to load available appointment slots.',
      });
    }
  }
);

router.get(
  '/appointments',
  async (req, res) => {
    try {
      const appointments =
        await Appointment.findAll({
          where: {
            patientId:
              req.user.id,
          },

          order: [
            ['date', 'DESC'],
            ['time', 'ASC'],
          ],
        });

      const doctorIds = [
        ...new Set(
          appointments
            .map(
              (appointment) =>
                appointment.doctorId
            )
            .filter(Boolean)
        ),
      ];

      const [
        doctors,
        doctorProfiles,
      ] = await Promise.all([
        doctorIds.length
          ? User.findAll({
              where: {
                id:
                  doctorIds,
              },
            })
          : [],

        doctorIds.length
          ? DoctorProfile.findAll({
              where: {
                userId:
                  doctorIds,
              },
            })
          : [],
      ]);

      res.json({
        appointments:
          appointments.map(
            (appointment) => ({
              id:
                appointment.id,

              date:
                appointment.date,

              time:
                appointment.time,

              status:
                appointment.status,

              visitCategory:
                appointment
                  .visitCategory,

              serviceType:
                appointment
                  .serviceType,

              doctorName:
                doctors.find(
                  (doctor) =>
                    doctor.id ===
                    appointment.doctorId
                )?.name ||
                null,

              specialization:
                doctorProfiles.find(
                  (profile) =>
                    profile.userId ===
                    appointment.doctorId
                )?.specialization ||
                null,

              careEpisodeId:
                appointment
                  .careEpisodeId ||
                null,
            })
          ),
      });
    } catch (error) {
      console.error(
        'GET /patient/appointments error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to load appointments.',
      });
    }
  }
);

router.post(
  '/appointments',
  async (req, res) => {
    try {
      const {
        visitCategory,
        serviceType,
        date,
        time,
        notes,
      } = req.body;

      const serviceTypeMap = {
        Dressing:
          'dressing',

        Physiotherapy:
          'physiotherapy',

        'Vitals Check':
          'vitals_check',

        'Doctor Visit':
          'doctor_visit',

        'Pharmacy Visit':
          'pharmacy_visit',
      };

      const normalizedServiceType =
        serviceTypeMap[
          serviceType
        ] ||
        serviceType;

      if (
        !visitCategory ||
        !serviceType ||
        !date ||
        !time
      ) {
        return res.status(400).json({
          error:
            'Please complete every step of the booking wizard.',
        });
      }

      if (
        !isValidDate(
          date
        )
      ) {
        return res.status(400).json({
          error:
            'Invalid appointment date.',
        });
      }

      if (
        !isValidTime(
          time
        )
      ) {
        return res.status(400).json({
          error:
            'Invalid appointment time.',
        });
      }

      /*
       * Appointment times are fixed by the admin (see
       * AppointmentSlot) - patients choose from that published
       * list rather than typing an arbitrary time, and that
       * choice is enforced server-side here too so the
       * restriction can't be bypassed by calling the API
       * directly.
       */
      const slot =
        await AppointmentSlot.findOne({
          where: {
            time,
            isActive: true,
          },
        });

      if (!slot) {
        return res.status(400).json({
          error:
            'That time is not an available appointment slot.',
        });
      }

      const episode =
        await getActiveCareEpisode(
          req.user.id
        );

      if (!episode) {
        return res.status(400).json({
          error:
            'No active recovery episode is available for appointment booking.',
        });
      }

      const doctorId =
        episode.doctorId;

      const [
        patientConflict,
        doctorConflict,
      ] = await Promise.all([
        hasPatientAppointmentConflict(
          req.user.id,
          date,
          time
        ),

        hasDoctorAppointmentConflict(
          doctorId,
          date,
          time
        ),
      ]);

      if (
        patientConflict
      ) {
        return res.status(409).json({
          error:
            'You already have an appointment at this date and time.',
        });
      }

      if (
        doctorConflict
      ) {
        return res.status(409).json({
          error:
            'The selected doctor already has an appointment at this date and time.',
        });
      }

      const appointment =
        await Appointment.create({
          patientId:
            req.user.id,

          doctorId,

          careEpisodeId:
            episode.id,

          visitCategory,

          serviceType:
            normalizedServiceType,

          date,

          time,

          status:
            'upcoming',

          notes:
            notes || null,
        });

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.user.id,
        doctorId,
        'appointment_created',
        { appointment }
      );

      res.status(201).json({
        appointment,
      });
    } catch (error) {
      console.error(
        'POST /patient/appointments error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to create appointment.',
      });
    }
  }
);

/*
 * PATIENT — RESCHEDULE OWN APPOINTMENT
 *
 * Mirrors the conflict checks used at booking time, and the
 * doctor/admin reschedule endpoints: the appointment is moved
 * in place and its status is reset to 'upcoming'. Only the
 * owning patient may reschedule, and only while the
 * appointment is still 'upcoming'.
 */
router.patch(
  '/appointments/:id/reschedule',
  async (req, res) => {
    try {
      const {
        date,
        time,
      } = req.body;

      if (!date || !time) {
        return res.status(400).json({
          error:
            'Date and time are required.',
        });
      }

      if (!isValidDate(date)) {
        return res.status(400).json({
          error:
            'Invalid appointment date.',
        });
      }

      if (!isValidTime(time)) {
        return res.status(400).json({
          error:
            'Invalid appointment time.',
        });
      }

      const slot =
        await AppointmentSlot.findOne({
          where: {
            time,
            isActive: true,
          },
        });

      if (!slot) {
        return res.status(400).json({
          error:
            'That time is not an available appointment slot.',
        });
      }

      const appointment =
        await Appointment.findOne({
          where: {
            id: req.params.id,
            patientId: req.user.id,
          },
        });

      if (!appointment) {
        return res.status(404).json({
          error:
            'Appointment not found.',
        });
      }

      if (appointment.status !== 'upcoming') {
        return res.status(400).json({
          error:
            'Only upcoming appointments can be rescheduled.',
        });
      }

      const [
        patientConflict,
        doctorConflict,
      ] = await Promise.all([
        hasPatientAppointmentConflict(
          req.user.id,
          date,
          time,
          appointment.id
        ),

        hasDoctorAppointmentConflict(
          appointment.doctorId,
          date,
          time,
          appointment.id
        ),
      ]);

      if (patientConflict) {
        return res.status(409).json({
          error:
            'You already have an appointment at this date and time.',
          conflictType: 'patient',
        });
      }

      if (doctorConflict) {
        return res.status(409).json({
          error:
            'Your doctor already has an appointment at this date and time.',
          conflictType: 'doctor',
        });
      }

      appointment.date = date;
      appointment.time = time;
      appointment.status = 'upcoming';

      await appointment.save();

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.user.id,
        appointment.doctorId,
        'appointment_rescheduled',
        { appointment }
      );

      res.json({
        message:
          'Appointment rescheduled.',
        appointment,
      });
    } catch (error) {
      console.error(
        'PATCH /patient/appointments/:id/reschedule error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to reschedule appointment.',
      });
    }
  }
);

/*
 * PATIENT — CANCEL OWN APPOINTMENT
 *
 * The row is kept (not deleted) so it remains visible in the
 * patient's appointment history, matching the frontend copy
 * ("The cancellation will remain visible in appointment
 * history.").
 */
router.patch(
  '/appointments/:id/cancel',
  async (req, res) => {
    try {
      const appointment =
        await Appointment.findOne({
          where: {
            id: req.params.id,
            patientId: req.user.id,
          },
        });

      if (!appointment) {
        return res.status(404).json({
          error:
            'Appointment not found.',
        });
      }

      if (appointment.status !== 'upcoming') {
        return res.status(400).json({
          error:
            'Only upcoming appointments can be cancelled.',
        });
      }

      appointment.status = 'cancelled';
      appointment.cancelledAt = new Date();

      await appointment.save();

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.user.id,
        appointment.doctorId,
        'appointment_cancelled',
        { appointment }
      );

      res.json({
        message:
          'Appointment cancelled.',
        appointment,
      });
    } catch (error) {
      console.error(
        'PATCH /patient/appointments/:id/cancel error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to cancel appointment.',
      });
    }
  }
);

/* =========================================================
   DIET MANAGEMENT
   ========================================================= */

router.post(
  '/diet-check',
  async (req, res) => {
    try {
      const {
        foodItem,
      } = req.body;

      if (!foodItem) {
        return res.status(400).json({
          error:
            'Please enter a food item.',
        });
      }

      const episode =
        await getActiveCareEpisode(
          req.user.id
        );

      const restrictions =
        episode
          ? await FoodRestriction.findAll(
              {
                where: {
                  patientId:
                    req.user.id,

                  careEpisodeId:
                    episode.id,
                },

                order: [
                  [
                    'createdAt',
                    'DESC',
                  ],
                ],
              }
            )
          : [];

      const result =
        await checkFoodSafety(
          String(
            foodItem
          ).trim(),
          restrictions
        );

      res.json(
        result
      );
    } catch (error) {
      console.error(
        'POST /patient/diet-check error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to evaluate the food item.',
      });
    }
  }
);

/* =========================================================
   MEDICINES
   ========================================================= */

router.get(
  '/medicines',
  async (req, res) => {
    try {
      const episode =
        await getActiveCareEpisode(
          req.user.id
        );

      if (!episode) {
        return res.json({
          medicines: [],
        });
      }

      const medicines =
        await Medicine.findAll({
          where: {
            patientId:
              req.user.id,

            careEpisodeId:
              episode.id,

            isActive:
              true,
          },

          order: [
            ['createdAt', 'DESC'],
          ],
        });

      res.json({
        medicines,
      });
    } catch (error) {
      console.error(
        'GET /patient/medicines error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to load medicines.',
      });
    }
  }
);

/* =========================================================
   ASSESSMENT — PHASE 3.1.3
   ========================================================= */

router.post(
  '/assessment',
  async (req, res) => {
    try {
      const {
        spo2,
        systolic,
        diastolic,
        heartRate,
        temperature,
      } = req.body;

      const values = [
        spo2,
        systolic,
        diastolic,
        heartRate,
        temperature,
      ];

      if (
        values.some(
          (value) =>
            value ===
              undefined ||
            value === '' ||
            value === null ||
            Number.isNaN(
              Number(value)
            )
        )
      ) {
        return res.status(400).json({
          error:
            'Please enter valid numeric values for all vital measurements.',
        });
      }

      const episode =
        await getActiveCareEpisode(
          req.user.id
        );

      if (!episode) {
        return res.status(400).json({
          error:
            'No active recovery episode is available for assessment.',
        });
      }

      const vitals = {
        spo2:
          Number(spo2),

        systolic:
          Number(systolic),

        diastolic:
          Number(diastolic),

        heartRate:
          Number(heartRate),

        temperature:
          Number(temperature),
      };

      /*
       * PHASE 3:
       *
       * The scoring operation is now asynchronous because
       * Node delegates inference to the actual Python
       * One-Class SVM service.
       */
      const scored =
        await scoreVitals(
          vitals
        );

      const score =
        Number(
          scored?.score ??
            0
        );

      const label =
        scored?.label ===
        'outlier'
          ? 'outlier'
          : 'normal';

      /*
       * Retrieve the patient's prior assessments for the
       * current active recovery episode.
       *
       * The ML score itself is produced by the SVM.
       * The longitudinal trajectory is computed separately
       * from the stored anomaly-score history.
       */
      const history =
        await VitalsAssessment.findAll(
          {
            where: {
              patientId:
                req.user.id,

              careEpisodeId:
                episode.id,
            },

            order: [
              [
                'measuredAt',
                'ASC',
              ],

              [
                'createdAt',
                'ASC',
              ],
            ],
          }
        );

      const trendLabel =
        computeTrend([
          ...history.map(
            (item) => ({
              anomalyScore:
                Number(
                  item.anomalyScore
                ),

              createdAt:
                item.createdAt ||
                item.measuredAt,
            })
          ),

          {
            anomalyScore:
              score,

            createdAt:
              new Date(),
          },
        ]);

      const measuredAt =
        new Date();

      const record =
        await VitalsAssessment.create({
          patientId:
            req.user.id,

          careEpisodeId:
            episode.id,

          spo2:
            vitals.spo2,

          systolic:
            vitals.systolic,

          diastolic:
            vitals.diastolic,

          heartRate:
            vitals.heartRate,

          temperature:
            vitals.temperature,

          measuredAt,

          /*
           * Persist the real model version reported by
           * the Python One-Class SVM service.
           */
          modelVersion:
            scored?.modelVersion ||
            'v2-one-class-svm-reference',

          anomalyScore:
            score,

          anomalyLabel:
            label,

          trendLabel,
        });

      const monitoringMessage =
        getMonitoringMessage
          ? getMonitoringMessage(
              label
            )
          : label ===
            'outlier'
          ? 'Measurement outside configured monitoring parameters.'
          : 'Within configured monitoring parameters.';

      const trajectoryMessage =
        trendLabel ===
        'Requires Attention'
          ? 'Significant deviation detected — clinical review recommended.'
          : trendLabel ===
            'Improving'
          ? 'Recent measurements show a favorable change in monitoring trajectory.'
          : trendLabel ===
            'Stable'
          ? 'No significant deviation detected in the longitudinal monitoring trajectory.'
          : 'More measurements are required to establish a longitudinal monitoring trajectory.';

      return res.status(201).json({
        result: {
          ...record.toJSON(),

          model: {
            version:
              scored?.modelVersion ||
              record.modelVersion,

            algorithm:
              scored?.algorithm ||
              'One-Class SVM (RBF kernel)',

            decisionValue:
              scored?.decisionValue ??
              null,

            prediction:
              scored?.prediction ??
              null,
          },

          monitoring: {
            message:
              monitoringMessage,

            anomalyLabel:
              label,

            anomalyScore:
              score,

            trajectory:
              trendLabel,

            trajectoryMessage,

            disclaimer:
              'Automated assessment is provided as monitoring support and is not a medical diagnosis.',
          },
        },
      });
    } catch (error) {
      console.error(
        'POST /patient/assessment error:',
        error
      );

      const message =
        error?.message ||
        '';

      if (
        message.includes(
          'One-Class SVM service'
        ) ||
        message.includes(
          'ML service'
        ) ||
        message.includes(
          'SVM service'
        )
      ) {
        return res.status(503).json({
          error:
            'The automated assessment service is temporarily unavailable. Please try again shortly.',
        });
      }

      return res.status(500).json({
        message:
          'Failed to process vital assessment.',
      });
    }
  }
);

router.get(
  '/assessment/history',
  async (req, res) => {
    try {
      const episode =
        await getActiveCareEpisode(
          req.user.id
        );

      if (!episode) {
        return res.json({
          history: [],

          monitoring: {
            message:
              'No active recovery episode is available.',

            trajectory:
              'Insufficient Data',

            disclaimer:
              'Automated assessment is provided as monitoring support and is not a medical diagnosis.',
          },
        });
      }

      const history =
        await VitalsAssessment.findAll(
          {
            where: {
              patientId:
                req.user.id,

              careEpisodeId:
                episode.id,
            },

            order: [
              [
                'measuredAt',
                'ASC',
              ],

              [
                'createdAt',
                'ASC',
              ],
            ],
          }
        );

      const normalizedHistory =
        history.map(
          (item) => ({
            ...item.toJSON(),

            anomalyScore:
              Number(
                item.anomalyScore
              ),
          })
        );

      const trajectory =
        computeTrend(
          normalizedHistory
        );

      let trajectoryMessage =
        'More measurements are required to establish a longitudinal monitoring trajectory.';

      if (
        trajectory ===
        'Improving'
      ) {
        trajectoryMessage =
          'Recent measurements show a favorable change in monitoring trajectory.';
      }

      if (
        trajectory ===
        'Stable'
      ) {
        trajectoryMessage =
          'No significant deviation detected in the longitudinal monitoring trajectory.';
      }

      if (
        trajectory ===
        'Requires Attention'
      ) {
        trajectoryMessage =
          'Significant deviation detected — clinical review recommended.';
      }

      return res.json({
        history:
          normalizedHistory,

        monitoring: {
          message:
            'Monitoring history is shown for the current recovery episode.',

          trajectory,

          trajectoryMessage,

          disclaimer:
            'Automated assessment is provided as monitoring support and is not a medical diagnosis.',
        },
      });
    } catch (error) {
      console.error(
        'GET /patient/assessment/history error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to load assessment history.',
      });
    }
  }
);

/* =========================================================
   KINGSLAYER
   ========================================================= */

router.post(
  '/kingslayer',
  async (req, res) => {
    try {
      const {
        message,
      } = req.body;

      if (
        !message ||
        !String(
          message
        ).trim()
      ) {
        return res.status(400).json({
          error:
            'Message cannot be empty.',
        });
      }

      const reply =
        await kingslayerReply(
          String(
            message
          ).trim()
        );

      res.json({
        reply,
      });
    } catch (error) {
      console.error(
        'POST /patient/kingslayer error:',
        error
      );

      res.status(500).json({
        message:
          'Kingslayer is temporarily unavailable.',
      });
    }
  }
);

/* =========================================================
   EMERGENCY CHAT
   ========================================================= */

router.get(
  '/emergency-chat/active',
  async (req, res) => {
    try {
      const thread =
        await ChatThread.findOne(
          {
            where: {
              patientId:
                req.user.id,

              status:
                'open',
            },

            order: [
              ['createdAt', 'DESC'],
            ],
          }
        );

      if (!thread) {
        return res.json({
          thread:
            null,

          messages:
            [],
        });
      }

      const messages =
        await ChatMessage.findAll(
          {
            where: {
              threadId:
                thread.id,
            },

            order: [
              ['createdAt', 'ASC'],
            ],
          }
        );

      res.json({
        thread: {
          id:
            thread.id,

          chatCode:
            thread.chatCode,

          status:
            thread.status,

          doctorId:
            thread.doctorId,

          careEpisodeId:
            thread
              .careEpisodeId ||
            null,
        },

        messages,
      });
    } catch (error) {
      console.error(
        'GET /patient/emergency-chat/active error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to load emergency chat.',
      });
    }
  }
);

router.post(
  '/emergency-chat/start',
  async (req, res) => {
    try {
      const episode =
        await getActiveCareEpisode(
          req.user.id
        );

      if (!episode) {
        return res.status(400).json({
          error:
            'No active doctor is assigned to your account.',
        });
      }

      let thread =
        await ChatThread.findOne({
          where: {
            patientId:
              req.user.id,

            status:
              'open',
          },

          order: [
            ['createdAt', 'DESC'],
          ],
        });

      if (!thread) {
        thread =
          await ChatThread.create({
            patientId:
              req.user.id,

            doctorId:
              episode.doctorId,

            careEpisodeId:
              episode.id,

            chatCode:
              generateChatCode(),

            status:
              'open',
          });
      }

      res.status(201).json({
        thread: {
          id:
            thread.id,

          chatCode:
            thread.chatCode,

          status:
            thread.status,

          doctorId:
            thread.doctorId,

          careEpisodeId:
            thread
              .careEpisodeId ||
            null,
        },
      });
    } catch (error) {
      console.error(
        'POST /patient/emergency-chat/start error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to start emergency chat.',
      });
    }
  }
);

router.post(
  '/emergency-chat/:threadId/messages',
  async (req, res) => {
    try {
      const thread =
        await ChatThread.findOne({
          where: {
            id:
              req.params.threadId,

            patientId:
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

      const {
        content,
      } = req.body;

      if (
        !content ||
        !String(
          content
        ).trim()
      ) {
        return res.status(400).json({
          error:
            'Message cannot be empty.',
        });
      }

      const message =
        await ChatMessage.create({
          threadId:
            thread.id,

          senderRole:
            'patient',

          content:
            String(
              content
            ).trim(),
        });

      const io =
        req.app.get('io');

      if (io) {
        io.to(
          `thread_${thread.id}`
        ).emit(
          'new_message',
          message
        );

        io.to(
          `doctor:${thread.doctorId}`
        ).emit(
          'new_message',
          message
        );
      }

      res.status(201).json({
        message,
      });
    } catch (error) {
      console.error(
        'POST /patient/emergency-chat/:threadId/messages error:',
        error
      );

      res.status(500).json({
        message:
          'Failed to send emergency chat message.',
      });
    }
  }
);

module.exports = router;