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
 * Validate appointment category/service combination.
 */
function isValidVisitSelection(
  visitCategory,
  serviceType
) {
  const homeServices = [
    'dressing',
    'physiotherapy',
    'vitals_check',
  ];

  const hospitalServices = [
    'doctor_visit',
    'pharmacy_visit',
  ];

  if (visitCategory === 'home_visit') {
    return homeServices.includes(
      serviceType
    );
  }

  if (
    visitCategory ===
    'hospital_visit'
  ) {
    return hospitalServices.includes(
      serviceType
    );
  }

  return false;
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

/* =========================================================
   HOME
   ========================================================= */

router.get('/home', async (req, res) => {
  try {
    const doctorId =
      req.user.id;

    const today =
      new Date()
        .toISOString()
        .slice(0, 10);

    const activeEpisodes =
      await CareEpisode.findAll({
        where: {
          doctorId,
          status: 'active',
        },

        include: [
          {
            model: Surgery,
            as: 'surgery',
          },
        ],
      });

    const sosAlerts =
      await SOSAlert.findAll({
        where: {
          doctorId,
          status: 'pending',
        },

        order: [
          ['createdAt', 'DESC'],
        ],
      });

    const todaysAppointments =
      await Appointment.findAll({
        where: {
          doctorId,
          date: today,
          status: 'upcoming',
        },

        order: [
          ['time', 'ASC'],
        ],
      });

    const patientIds =
      [
        ...new Set(
          todaysAppointments.map(
            (appointment) =>
              appointment.patientId
          )
        ),
      ];

    const patientProfiles =
      await PatientProfile.findAll({
        where: {
          userId: patientIds,
        },
      });

    const patientUsers =
      await User.findAll({
        where: {
          id: patientIds,
        },
      });

    function enrichPatient(
      patientId
    ) {
      const episode =
        activeEpisodes.find(
          (item) =>
            item.patientId ===
            patientId
        );

      const surgery =
        episode?.surgery;

      const profile =
        patientProfiles.find(
          (item) =>
            item.userId ===
            patientId
        );

      const user =
        patientUsers.find(
          (item) =>
            item.id ===
            patientId
        );

      return {
        patientName:
          user?.name || null,

        surgery:
          surgery?.surgeryName ||
          null,

        bloodGroup:
          profile?.bloodGroup ||
          null,
      };
    }

    res.json({
      sosAlerts:
        sosAlerts.map(
          (alert) => ({
            id: alert.id,
            patientId:
              alert.patientId,

            patientName:
              alert.patientNameSnapshot,

            surgery:
              alert.surgerySnapshot,

            bloodGroup:
              alert.bloodGroupSnapshot,

            createdAt:
              alert.createdAt,
          })
        ),

      todaysAppointments:
        todaysAppointments.map(
          (appointment) => ({
            id: appointment.id,
            patientId:
              appointment.patientId,

            time:
              appointment.time,

            visitCategory:
              appointment.visitCategory,

            serviceType:
              appointment.serviceType,

            ...enrichPatient(
              appointment.patientId
            ),
          })
        ),
    });
  } catch (error) {
    console.error(
      'Doctor home error:',
      error
    );

    res.status(500).json({
      error:
        'Unable to load doctor home.',
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
      const {
        name,
        phone,
        specialization,
        bio,
      } = req.body;

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

      if (
        name !== undefined
      ) {
        user.name =
          String(name).trim();
      }

      if (
        phone !== undefined
      ) {
        user.phone = phone;
      }

      await user.save();

      if (
        specialization !==
        undefined
      ) {
        profile.specialization =
          specialization;
      }

      if (
        bio !== undefined
      ) {
        profile.bio = bio;
      }

      await profile.save();

      res.json({
        message:
          'Profile updated.',
      });
    } catch (error) {
      console.error(
        'Doctor profile update error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to update doctor profile.',
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
            'Doctor account not found.',
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
      const careEpisodes =
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

          order: [
            ['createdAt', 'DESC'],
          ],
        });

      const patientIds =
        careEpisodes.map(
          (episode) =>
            episode.patientId
        );

      const users =
        await User.findAll({
          where: {
            id: patientIds,
          },
        });

      res.json({
        patients:
          careEpisodes.map(
            (episode) => {
              const user =
                users.find(
                  (item) =>
                    item.id ===
                    episode.patientId
                );

              const surgery =
                episode.surgery;

              return {
                patientId:
                  episode.patientId,

                surgeryId:
                  surgery?.id ||
                  null,

                careEpisodeId:
                  episode.id,

                name:
                  user?.name ||
                  null,

                surgeryName:
                  surgery?.surgeryName ||
                  null,

                recoveryDaysRemaining:
                  computeRecovery(
                    episode.startDate,
                    episode
                      .expectedRecoveryDays
                  ).daysRemaining,

                recoveryTotalDays:
                  episode
                    .expectedRecoveryDays,

                status:
                  episode.status,
              };
            }
          ),
      });
    } catch (error) {
      console.error(
        'Doctor patients error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load patients.',
      });
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
      const careEpisode =
        await assertActiveMapping(
          req.user.id,
          req.params.patientId,
          res
        );

      if (!careEpisode) {
        return;
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

      const files =
        await MedicalFile.findAll({
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
            computeRecovery(
              careEpisode.startDate,
              careEpisode
                .expectedRecoveryDays
            ).daysRemaining,

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
      const careEpisode =
        await assertActiveMapping(
          req.user.id,
          req.params.patientId,
          res
        );

      if (!careEpisode) {
        return;
      }

      const delta =
        Number(req.body.delta);

      if (
        !Number.isInteger(delta) ||
        delta === 0
      ) {
        return res.status(400).json({
          error:
            'Delta must be a non-zero integer.',
        });
      }

      const currentTotal =
        Number(
          careEpisode
            .expectedRecoveryDays
        );

      /*
       * Days already completed must come from the calendar
       * (today minus startDate), not from the previously
       * stored `daysRemaining` counter. That counter never
       * actually decreased on its own as real days passed, so
       * deriving "completed" as `total - storedRemaining`
       * always produced 0 - which is why the recovery
       * countdown looked frozen no matter how much time
       * actually went by.
       */
      const completedDays =
        computeRecovery(
          careEpisode.startDate,
          currentTotal
        ).daysCompleted;

      const requestedTotal =
        currentTotal + delta;

      const newTotal =
        Math.max(
          completedDays,
          requestedTotal,
          1
        );

      const newRemaining =
        computeRecovery(
          careEpisode.startDate,
          newTotal
        ).daysRemaining;

      careEpisode.expectedRecoveryDays =
        newTotal;

      careEpisode.daysRemaining =
        newRemaining;

      /*
       * Keep the legacy Surgery recovery fields synchronized.
       * CareEpisode remains the source of truth.
       */
      const surgery =
        careEpisode.surgery;

      if (!surgery) {
        return res.status(500).json({
          error:
            'The active care episode has no associated surgery.',
        });
      }

      syncSurgeryRecovery(
        surgery,
        careEpisode
      );

      await surgery.save();
      await careEpisode.save();

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.params.patientId,
        req.user.id,
        'recovery_updated',
        { careEpisode }
      );

      res.json({
        careEpisodeId:
          careEpisode.id,

        surgeryId:
          surgery.id,

        daysCompleted:
          completedDays,

        daysRemaining:
          careEpisode
            .daysRemaining,

        totalDays:
          careEpisode
            .expectedRecoveryDays,

        status:
          careEpisode.status,
      });
    } catch (error) {
      console.error(
        'Recovery days error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to update recovery duration.',
      });
    }
  }
);

/* =========================================================
   DISCHARGE
   ========================================================= */

router.post(
  '/patients/:patientId/discharge',
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

      const surgery =
        careEpisode.surgery;

      if (!surgery) {
        return res.status(500).json({
          error:
            'The active care episode has no associated surgery.',
        });
      }

      const today =
        new Date()
          .toISOString()
          .slice(0, 10);

      /*
       * Complete the temporary recovery episode.
       */
      careEpisode.status =
        'completed';

      careEpisode.daysRemaining =
        0;

      careEpisode.completedAt =
        new Date();

      careEpisode.dischargeDate =
        today;

      /*
       * Preserve the surgery permanently in history.
       * Only its active status changes to completed.
       */
      surgery.status =
        'completed';

      surgery.recoveryDaysRemaining =
        0;

      surgery.dischargeDate =
        today;

      await surgery.save();
      await careEpisode.save();

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.params.patientId,
        req.user.id,
        'care_episode_completed',
        { careEpisodeId: careEpisode.id }
      );

      res.json({
        message:
          `${surgery.surgeryName} recovery marked complete. Patient discharged from your active care list.`,

        careEpisodeId:
          careEpisode.id,

        surgeryId:
          surgery.id,

        status:
          careEpisode.status,

        daysRemaining:
          careEpisode.daysRemaining,
      });
    } catch (error) {
      console.error(
        'Patient discharge error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to complete discharge.',
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

          label:
            req.body.label ||
            req.file.originalname,

          fileUrl:
            `/uploads/patient_files/${req.file.filename}`,

          fileType,

          fileSize:
            req.file.size,
        });

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

/* =========================================================
   MEDICINES
   ========================================================= */

router.post(
  '/patients/:patientId/medicines',
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

      const {
        name,
        form,
        dosage,
        frequency,
        times,
        startDate,
        endDate,
      } = req.body;

      if (
        !name ||
        !dosage ||
        !frequency
      ) {
        return res.status(400).json({
          error:
            'Name, dosage, and frequency are required.',
        });
      }

      if (
        times !== undefined &&
        !Array.isArray(times)
      ) {
        return res.status(400).json({
          error:
            'Medicine reminder times must be an array.',
        });
      }

      const validTimeFormat =
        /^([01]\d|2[0-3]):[0-5]\d$/;

      if (
        Array.isArray(times) &&
        !times.every(
          (time) =>
            typeof time ===
              'string' &&
            validTimeFormat.test(
              time
            )
        )
      ) {
        return res.status(400).json({
          error:
            'Each medicine reminder time must use HH:mm format.',
        });
      }

      const medicine =
        await Medicine.create({
          patientId:
            req.params.patientId,

          surgeryId:
            careEpisode
              .surgery.id,

          careEpisodeId:
            careEpisode.id,

          doctorId:
            req.user.id,

          name:
            String(name).trim(),

          form:
            form || 'Tablet',

          dosage:
            String(dosage).trim(),

          frequency:
            String(frequency).trim(),

          times:
            times || [],

          startDate:
            startDate || null,

          endDate:
            endDate || null,

          isActive: true,
        });

      res.status(201).json({
        medicine,
      });
    } catch (error) {
      console.error(
        'Medicine creation error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to create medicine prescription.',
      });
    }
  }
);

router.delete(
  '/patients/:patientId/medicines/:medId',
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

      const medicine =
        await Medicine.findOne({
          where: {
            id:
              req.params.medId,

            patientId:
              req.params.patientId,

            surgeryId:
              careEpisode
                .surgery.id,

            careEpisodeId:
              careEpisode.id,

            doctorId:
              req.user.id,

            isActive:
              true,
          },
        });

      if (!medicine) {
        return res.status(404).json({
          error:
            'Medicine not found.',
        });
      }

      medicine.isActive =
        false;

      await medicine.save();

      res.json({
        message:
          'Medicine removed.',
      });
    } catch (error) {
      console.error(
        'Medicine removal error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to remove medicine.',
      });
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
      const careEpisode =
        await assertActiveMapping(
          req.user.id,
          req.params.patientId,
          res
        );

      if (!careEpisode) {
        return;
      }

      const {
        dietTemplate,
        ingredientsToAvoid,
      } = req.body;

      if (
        !ingredientsToAvoid ||
        !String(
          ingredientsToAvoid
        ).trim()
      ) {
        return res.status(400).json({
          error:
            'Please list ingredients to avoid.',
        });
      }

      const restriction =
        await FoodRestriction.create({
          patientId:
            req.params.patientId,

          surgeryId:
            careEpisode
              .surgery.id,

          careEpisodeId:
            careEpisode.id,

          doctorId:
            req.user.id,

          dietTemplate:
            dietTemplate
              ? String(
                  dietTemplate
                ).trim()
              : null,

          ingredientsToAvoid:
            String(
              ingredientsToAvoid
            ).trim(),
        });

      res.status(201).json({
        restriction,
      });
    } catch (error) {
      console.error(
        'Food restriction error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to save food restriction.',
      });
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
   COMPLETE APPOINTMENT
   ========================================================= */

router.patch(
  '/appointments/:id/complete',
  async (req, res) => {
    try {
      const appointment =
        await Appointment.findOne({
          where: {
            id:
              req.params.id,

            doctorId:
              req.user.id,
          },
        });

      if (!appointment) {
        return res.status(404).json({
          error:
            'Appointment not found.',
        });
      }

      if (
        ![
          'scheduled',
          'upcoming',
        ].includes(
          appointment.status
        )
      ) {
        return res.status(400).json({
          error:
            'Only scheduled or upcoming appointments can be completed.',
        });
      }

      appointment.status =
        'completed';

      appointment.completedAt =
        new Date();

      await appointment.save();

      notifyPatientAndDoctor(
        req.app.get('io'),
        appointment.patientId,
        req.user.id,
        'appointment_completed',
        { appointment }
      );

      res.json({
        message:
          'Appointment marked as completed.',
      });
    } catch (error) {
      console.error(
        'Appointment completion error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to complete appointment.',
      });
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

      if (
        !isValidAppointmentTime(
          time
        )
      ) {
        return res.status(400).json({
          error:
            'Time must use HH:mm format.',
        });
      }

      const appointment =
        await Appointment.findOne({
          where: {
            id:
              req.params.id,

            doctorId:
              req.user.id,
          },
        });

      if (!appointment) {
        return res.status(404).json({
          error:
            'Appointment not found.',
        });
      }

      if (
        appointment.status ===
        'cancelled'
      ) {
        return res.status(400).json({
          error:
            'Cancelled appointments cannot be rescheduled.',
        });
      }

      const doctorConflict =
        await hasDoctorConflict(
          req.user.id,
          date,
          time,
          appointment.id
        );

      if (doctorConflict) {
        return res.status(409).json({
          error:
            'The doctor already has an appointment at this date and time.',
          conflictType:
            'doctor',
          conflictingAppointmentId:
            doctorConflict.id,
        });
      }

      const patientConflict =
        await hasPatientConflict(
          appointment.patientId,
          date,
          time,
          appointment.id
        );

      if (patientConflict) {
        return res.status(409).json({
          error:
            'The patient already has an appointment at this date and time.',
          conflictType:
            'patient',
          conflictingAppointmentId:
            patientConflict.id,
        });
      }

      appointment.date =
        date;

      appointment.time =
        time;

      appointment.status =
        'upcoming';

      await appointment.save();

      notifyPatientAndDoctor(
        req.app.get('io'),
        appointment.patientId,
        req.user.id,
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
        'Appointment reschedule error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to reschedule appointment.',
      });
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
      const careEpisode =
        await assertActiveMapping(
          req.user.id,
          req.params.patientId,
          res
        );

      if (!careEpisode) {
        return;
      }

      const {
        visitCategory,
        serviceType,
        date,
        time,
        notes,
      } = req.body;

      if (
        !visitCategory ||
        !serviceType ||
        !date ||
        !time
      ) {
        return res.status(400).json({
          error:
            'Visit category, service type, date, and time are required.',
        });
      }

      if (
        !isValidAppointmentTime(
          time
        )
      ) {
        return res.status(400).json({
          error:
            'Time must use HH:mm format.',
        });
      }

      if (
        !isValidVisitSelection(
          visitCategory,
          serviceType
        )
      ) {
        return res.status(400).json({
          error:
            'Invalid visit category or service type.',
        });
      }

      const doctorConflict =
        await hasDoctorConflict(
          req.user.id,
          date,
          time
        );

      if (doctorConflict) {
        return res.status(409).json({
          error:
            'The doctor already has an appointment at this date and time.',
          conflictType:
            'doctor',
          conflictingAppointmentId:
            doctorConflict.id,
        });
      }

      const patientConflict =
        await hasPatientConflict(
          req.params.patientId,
          date,
          time
        );

      if (patientConflict) {
        return res.status(409).json({
          error:
            'The patient already has an appointment at this date and time.',
          conflictType:
            'patient',
          conflictingAppointmentId:
            patientConflict.id,
        });
      }

      const appointment =
        await Appointment.create({
          patientId:
            req.params.patientId,

          doctorId:
            req.user.id,

          careEpisodeId:
            careEpisode.id,

          visitCategory,
          serviceType,
          date,
          time,
          notes:
            notes || null,

          status:
            'upcoming',
        });

      notifyPatientAndDoctor(
        req.app.get('io'),
        req.params.patientId,
        req.user.id,
        'appointment_created',
        { appointment }
      );

      res.status(201).json({
        appointment,
      });
    } catch (error) {
      console.error(
        'Doctor appointment creation error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to create appointment.',
      });
    }
  }
);

/* =========================================================
   PRIORITY INBOX
   ========================================================= */

router.get(
  '/inbox',
  async (req, res) => {
    try {
      const threads =
        await ChatThread.findAll({
          where: {
            doctorId:
              req.user.id,

            status:
              'open',
          },

          order: [
            ['createdAt', 'DESC'],
          ],
        });

      const patientIds = [
        ...new Set(
          threads.map(
            (thread) =>
              thread.patientId
          )
        ),
      ];

      const users =
        await User.findAll({
          where: {
            id: patientIds,
          },
        });

      res.json({
        threads:
          threads.map(
            (thread) => ({
              id:
                thread.id,

              chatCode:
                thread.chatCode,

              patientId:
                thread.patientId,

              patientName:
                users.find(
                  (user) =>
                    user.id ===
                    thread.patientId
                )?.name ||
                null,

              createdAt:
                thread.createdAt,
            })
          ),
      });
    } catch (error) {
      console.error(
        'Priority inbox error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to load priority inbox.',
      });
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

      thread.status =
        'closed';

      thread.closedAt =
        new Date();

      await thread.save();

      res.json({
        message:
          'Chat closed and archived to the patient file.',
      });
    } catch (error) {
      console.error(
        'Close chat error:',
        error
      );

      res.status(500).json({
        error:
          'Unable to close chat.',
      });
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