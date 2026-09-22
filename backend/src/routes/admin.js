const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { Op } = require('sequelize');

const {
  authenticate,
  requireRole,
} = require('../middleware/auth');

const {
  User,
  DoctorProfile,
  Surgery,
  Appointment,
  SOSAlert,
  CareEpisode,
  AppointmentSlot,
} = require('../models');

const { normalizePhone, isValidPhone } = require('../utils/phone');
const { todayInAppTz } = require('../utils/dates');
const { respondIfSlotTaken } = require('../utils/conflicts');

const {
  generateUniqueDoctorId,
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

const router = express.Router();

router.use(
  authenticate,
  requireRole('admin')
);

/* =========================================================
   HELPERS
   ========================================================= */

function validationErrors(req) {
  const errors =
    validationResult(req);

  if (!errors.isEmpty()) {
    return errors.array();
  }

  return null;
}

function isAppointmentActive(status) {
  return ![
    'cancelled',
    'completed',
    'rescheduled',
  ].includes(
    String(
      status || ''
    ).toLowerCase()
  );
}

/* =========================================================
   DASHBOARD STATS
   ========================================================= */

router.get(
  '/stats',
  async (req, res) => {
    try {
      const [
        totalDoctors,
        totalPatients,
        activeSurgeries,
        pendingEscalations,
      ] = await Promise.all([
        User.count({
          where: {
            role:
              'doctor',
            isActive:
              true,
          },
        }),

        User.count({
          where: {
            role:
              'patient',
            isActive:
              true,
          },
        }),

        Surgery.count({
          where: {
            status:
              'active',
          },
        }),

        SOSAlert.count({
          where: {
            status:
              'escalated_admin',
          },
        }),
      ]);

      return res.json({
        totalDoctors,
        totalPatients,
        activeSurgeries,
        pendingEscalations,
      });
    } catch (error) {
      console.error(
        'GET /admin/stats error:',
        error
      );

      return res.status(500).json({
        message:
          'Failed to load admin statistics.',
      });
    }
  }
);

/* =========================================================
   DOCTORS - LIST
   ========================================================= */

router.get(
  '/doctors',
  async (req, res) => {
    try {
      const doctors =
        await User.findAll({
          where: {
            role:
              'doctor',
          },

          include: [
            {
              model:
                DoctorProfile,

              as:
                'doctorProfile',
            },
          ],

          order: [
            ['createdAt', 'DESC'],
          ],
        });

      return res.json(
        doctors.map(
          (doctor) => ({
            id:
              doctor.id,

            name:
              doctor.name,

            email:
              doctor.email,

            phone:
              doctor.phone,

            photoUrl:
              doctor.photoUrl,

            isActive:
              doctor.isActive,

            createdAt:
              doctor.createdAt,

            doctorProfile:
              doctor
                .doctorProfile
                ? {
                    uniqueDoctorId:
                      doctor
                        .doctorProfile
                        .uniqueDoctorId,

                    specialization:
                      doctor
                        .doctorProfile
                        .specialization,

                    dutyStatus:
                      doctor
                        .doctorProfile
                        .dutyStatus,

                    bio:
                      doctor
                        .doctorProfile
                        .bio,
                  }
                : null,
          })
        )
      );
    } catch (error) {
      console.error(
        'GET /admin/doctors error:',
        error
      );

      return res.status(500).json({
        message:
          'Failed to load doctors.',
      });
    }
  }
);

/* =========================================================
   DOCTORS - CREATE
   ========================================================= */

router.post(
  '/doctors',
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage(
        'Doctor name is required.'
      ),

    body('email')
      .trim()
      .isEmail()
      .withMessage(
        'A valid doctor email is required.'
      ),

    body('password')
      .isLength({
        min:
          6,
      })
      .withMessage(
        'Doctor password must be at least 6 characters.'
      ),

    body('phone')
      .optional({
        nullable:
          true,
      })
      .trim()
      .custom((value) => !value || isValidPhone(value))
      .withMessage('Enter a valid 10-digit mobile number.'),

    body('specialization')
      .optional({
        nullable:
          true,
      })
      .trim(),

    body('bio')
      .optional({
        nullable:
          true,
      })
      .trim(),
  ],

  async (req, res) => {
    try {
      const errors =
        validationErrors(req);

      if (errors) {
        return res.status(400).json({
          message:
            errors[0].msg,

          errors,
        });
      }

      const {
        name,
        email,
        password,
        phone: rawPhone = null,
        specialization = null,
        bio = null,
      } = req.body;

      const phone = rawPhone ? normalizePhone(rawPhone) : null;

      const normalizedEmail =
        String(email)
          .toLowerCase()
          .trim();

      const existingUser =
        await User.findOne({
          where: {
            email:
              normalizedEmail,
          },
        });

      if (existingUser) {
        return res.status(409).json({
          message:
            'An account with this email already exists.',
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      const uniqueDoctorId =
        await generateUniqueDoctorId();

      const doctor =
        await User.create({
          name:
            String(name).trim(),

          email:
            normalizedEmail,

          passwordHash,

          phone,

          role:
            'doctor',

          isActive:
            true,
        });

      const doctorProfile =
        await DoctorProfile.create({
          userId:
            doctor.id,

          uniqueDoctorId,

          specialization,

          dutyStatus:
            'on_duty',

          bio,
        });

      return res.status(201).json({
        message:
          'Doctor created successfully.',

        doctor: {
          id:
            doctor.id,

          name:
            doctor.name,

          email:
            doctor.email,

          phone:
            doctor.phone,

          isActive:
            doctor.isActive,

          doctorProfile: {
            uniqueDoctorId:
              doctorProfile
                .uniqueDoctorId,

            specialization:
              doctorProfile
                .specialization,

            dutyStatus:
              doctorProfile
                .dutyStatus,

            bio:
              doctorProfile.bio,
          },
        },
      });
    } catch (error) {
      console.error(
        'POST /admin/doctors error:',
        error
      );

      return res.status(500).json({
        message:
          'Failed to create doctor.',
      });
    }
  }
);

/* =========================================================
   DOCTORS - DEACTIVATE
   ========================================================= */

router.patch(
  '/doctors/:id/deactivate',
  async (req, res) => {
    try {
      const doctor =
        await User.findOne({
          where: {
            id:
              req.params.id,

            role:
              'doctor',
          },
        });

      if (!doctor) {
        return res.status(404).json({
          message:
            'Doctor not found.',
        });
      }

      doctor.isActive =
        false;

      await doctor.save();

      return res.json({
        message:
          'Doctor deactivated successfully.',

        doctor: {
          id:
            doctor.id,

          isActive:
            doctor.isActive,
        },
      });
    } catch (error) {
      console.error(
        'PATCH /admin/doctors/:id/deactivate error:',
        error
      );

      return res.status(500).json({
        message:
          'Failed to deactivate doctor.',
      });
    }
  }
);

/* =========================================================
   DOCTORS - ACTIVATE
   ========================================================= */

router.patch(
  '/doctors/:id/activate',
  async (req, res) => {
    try {
      const doctor =
        await User.findOne({
          where: {
            id:
              req.params.id,

            role:
              'doctor',
          },
        });

      if (!doctor) {
        return res.status(404).json({
          message:
            'Doctor not found.',
        });
      }

      doctor.isActive =
        true;

      await doctor.save();

      return res.json({
        message:
          'Doctor activated successfully.',

        doctor: {
          id:
            doctor.id,

          isActive:
            doctor.isActive,
        },
      });
    } catch (error) {
      console.error(
        'PATCH /admin/doctors/:id/activate error:',
        error
      );

      return res.status(500).json({
        message:
          'Failed to activate doctor.',
      });
    }
  }
);

/* =========================================================
   MASTER APPOINTMENTS / CLASH MANAGEMENT
   ========================================================= */

/*
 * Appointment relationships:
 *
 * Appointment
 *   └── careEpisode
 *          └── surgery
 *
 * There is NO direct Appointment -> Surgery association.
 */
router.get(
  '/appointments',
  async (req, res) => {
    try {
      const appointments =
        await Appointment.findAll({
          include: [
            {
              model:
                User,

              as:
                'patient',

              attributes: [
                'id',
                'name',
                'email',
                'phone',
              ],
            },

            {
              model:
                User,

              as:
                'doctor',

              attributes: [
                'id',
                'name',
                'email',
                'phone',
              ],

              include: [
                {
                  model:
                    DoctorProfile,

                  as:
                    'doctorProfile',

                  attributes: [
                    'uniqueDoctorId',
                    'specialization',
                    'dutyStatus',
                  ],
                },
              ],
            },

            {
              model:
                CareEpisode,

              as:
                'careEpisode',

              required:
                false,

              include: [
                {
                  model:
                    Surgery,

                  as:
                    'surgery',

                  required:
                    false,
                },
              ],
            },
          ],

          order: [
            ['date', 'ASC'],
            ['time', 'ASC'],
          ],
        });

      const activeAppointments =
        appointments.filter(
          (
            appointment
          ) =>
            isAppointmentActive(
              appointment.status
            )
        );

      const clashCounts =
        new Map();

      /*
       * A clash is a doctor having more than one
       * active appointment at exactly the same
       * date/time.
       */
      for (
        const appointment of
          activeAppointments
      ) {
        const key = [
          appointment.doctorId,
          appointment.date,
          appointment.time,
        ].join('|');

        clashCounts.set(
          key,
          (
            clashCounts.get(
              key
            ) || 0
          ) + 1
        );
      }

      return res.json(
        appointments.map(
          (
            appointment
          ) => {
            const key =
              [
                appointment.doctorId,
                appointment.date,
                appointment.time,
              ].join('|');

            const clashCount =
              clashCounts.get(
                key
              ) || 0;

            const careEpisode =
              appointment.careEpisode;

            const surgery =
              careEpisode
                ?.surgery ||
              null;

            return {
              id:
                appointment.id,

              patientId:
                appointment.patientId,

              doctorId:
                appointment.doctorId,

              careEpisodeId:
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

              notes:
                appointment.notes,

              completedAt:
                appointment.completedAt,

              cancelledAt:
                appointment.cancelledAt,

              hasClash:
                clashCount >
                1,

              clashCount,

              patient:
                appointment
                  .patient
                  ? {
                      id:
                        appointment
                          .patient.id,

                      name:
                        appointment
                          .patient.name,

                      email:
                        appointment
                          .patient
                          .email,

                      phone:
                        appointment
                          .patient
                          .phone,
                    }
                  : null,

              doctor:
                appointment
                  .doctor
                  ? {
                      id:
                        appointment
                          .doctor.id,

                      name:
                        appointment
                          .doctor.name,

                      email:
                        appointment
                          .doctor.email,

                      phone:
                        appointment
                          .doctor.phone,

                      doctorProfile:
                        appointment
                          .doctor
                          .doctorProfile
                          ? {
                              uniqueDoctorId:
                                appointment
                                  .doctor
                                  .doctorProfile
                                  .uniqueDoctorId,

                              specialization:
                                appointment
                                  .doctor
                                  .doctorProfile
                                  .specialization,

                              dutyStatus:
                                appointment
                                  .doctor
                                  .doctorProfile
                                  .dutyStatus,
                            }
                          : null,
                    }
                  : null,

              /*
               * Surgery comes through CareEpisode.
               */
              surgery:
                surgery
                  ? {
                      id:
                        surgery.id,

                      surgeryName:
                        surgery
                          .surgeryName,

                      surgeryDate:
                        surgery
                          .surgeryDate,

                      startDate:
                        surgery
                          .startDate,

                      status:
                        surgery.status,
                    }
                  : null,

              careEpisode:
                careEpisode
                  ? {
                      id:
                        careEpisode.id,

                      status:
                        careEpisode.status,

                      startDate:
                        careEpisode.startDate,

                      expectedRecoveryDays:
                        careEpisode
                          .expectedRecoveryDays,

                      daysRemaining:
                        careEpisode.status ===
                        'active'
                          ? computeRecovery(
                              careEpisode.startDate,
                              careEpisode
                                .expectedRecoveryDays
                            ).daysRemaining
                          : careEpisode
                              .daysRemaining,

                      surgeryId:
                        careEpisode
                          .surgeryId,
                    }
                  : null,
            };
          }
        )
      );
    } catch (error) {
      console.error(
        'GET /admin/appointments error:',
        error
      );

      return res.status(500).json({
        message:
          'Failed to load appointments.',
      });
    }
  }
);

/* =========================================================
   APPOINTMENT - RESCHEDULE
   ========================================================= */

router.patch(
  '/appointments/:id/reschedule',
  async (req, res) => {
    try {
      const {
        date,
        time,
      } = req.body;

      if (
        !date ||
        !time
      ) {
        return res.status(400).json({
          message:
            'Date and time are required.',
        });
      }

      const appointment =
        await Appointment.findByPk(
          req.params.id
        );

      if (!appointment) {
        return res.status(404).json({
          message:
            'Appointment not found.',
        });
      }

      if (
        appointment.status ===
          'completed' ||
        appointment.status ===
          'cancelled'
      ) {
        return res.status(409).json({
          message:
            'Completed or cancelled appointments cannot be rescheduled.',
        });
      }

      const clash =
        await Appointment.findOne({
          where: {
            id: {
              [Op.ne]:
                appointment.id,
            },

            doctorId:
              appointment.doctorId,

            date,

            time,

            status: {
              [Op.notIn]: [
                'cancelled',
                'completed',
                'rescheduled',
              ],
            },
          },
        });

      if (clash) {
        return res.status(409).json({
          message:
            'The doctor already has an active appointment at this date and time.',

          clash: {
            id:
              clash.id,

            date:
              clash.date,

            time:
              clash.time,

            status:
              clash.status,
          },
        });
      }

      /*
       * The doctor-side check above is not sufficient on its
       * own: it happens to catch same-patient clashes today
       * only because every patient currently has a single
       * doctor for the lifetime of their care episode. That
       * assumption no longer holds now that a patient can be
       * re-admitted under a different doctor after discharge,
       * so this also has to check the patient explicitly.
       */
      const patientClash =
        await Appointment.findOne({
          where: {
            id: {
              [Op.ne]:
                appointment.id,
            },

            patientId:
              appointment.patientId,

            date,

            time,

            status: {
              [Op.notIn]: [
                'cancelled',
                'completed',
                'rescheduled',
              ],
            },
          },
        });

      if (patientClash) {
        return res.status(409).json({
          message:
            'The patient already has an active appointment at this date and time.',

          clash: {
            id:
              patientClash.id,

            date:
              patientClash.date,

            time:
              patientClash.time,

            status:
              patientClash.status,
          },
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
        appointment.doctorId,
        'appointment_rescheduled',
        { appointment }
      );

      return res.json({
        message:
          'Appointment rescheduled successfully.',

        appointment: {
          id:
            appointment.id,

          date:
            appointment.date,

          time:
            appointment.time,

          status:
            appointment.status,
        },
      });
    } catch (error) {
      if (respondIfSlotTaken(error, res)) return;

      console.error(
        'PATCH /admin/appointments/:id/reschedule error:',
        error
      );

      return res.status(500).json({
        message:
          'Failed to reschedule appointment.',
      });
    }
  }
);

/* =========================================================
   SOS ESCALATIONS
   ========================================================= */

async function loadEscalatedSOS() {
  const alerts =
    await SOSAlert.findAll({
      where: {
        status:
          'escalated_admin',
      },

      include: [
        {
          model:
            User,

          as:
            'patient',

          attributes: [
            'id',
            'name',
            'email',
            'phone',
          ],
        },

        {
          model:
            User,

          as:
            'doctor',

          attributes: [
            'id',
            'name',
            'email',
            'phone',
          ],

          include: [
            {
              model:
                DoctorProfile,

              as:
                'doctorProfile',

              attributes: [
                'uniqueDoctorId',
                'specialization',
                'dutyStatus',
              ],
            },
          ],
        },

        {
          model:
            CareEpisode,

          as:
            'careEpisode',

          required:
            false,

          include: [
            {
              model:
                Surgery,

              as:
                'surgery',

              required:
                false,
            },
          ],
        },
      ],

      order: [
        ['createdAt', 'DESC'],
      ],
    });

  return alerts.map(
    (
      alert
    ) => {
      const careEpisode =
        alert.careEpisode;

      const surgery =
        careEpisode
          ?.surgery ||
        null;

      return {
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

        createdAt:
          alert.createdAt,

        escalatedAt:
          alert.escalatedAt,

        acknowledgedAt:
          alert.acknowledgedAt,

        adminAcknowledgedAt:
          alert.adminAcknowledgedAt,

        resolvedBy:
          alert.resolvedBy,

        resolvedAt:
          alert.resolvedAt,

        /*
         * Snapshot values are the authoritative values
         * for the emergency event.
         */
        patientNameSnapshot:
          alert.patientNameSnapshot,

        surgerySnapshot:
          alert.surgerySnapshot,

        bloodGroupSnapshot:
          alert.bloodGroupSnapshot,

        patient:
          alert.patient
            ? {
                id:
                  alert.patient.id,

                name:
                  alert.patient.name,

                email:
                  alert.patient.email,

                phone:
                  alert.patient.phone,
              }
            : null,

        doctor:
          alert.doctor
            ? {
                id:
                  alert.doctor.id,

                name:
                  alert.doctor.name,

                email:
                  alert.doctor.email,

                phone:
                  alert.doctor.phone,

                doctorProfile:
                  alert.doctor
                    .doctorProfile
                    ? {
                        uniqueDoctorId:
                          alert
                            .doctor
                            .doctorProfile
                            .uniqueDoctorId,

                        specialization:
                          alert
                            .doctor
                            .doctorProfile
                            .specialization,

                        dutyStatus:
                          alert
                            .doctor
                            .doctorProfile
                            .dutyStatus,
                      }
                    : null,
              }
            : null,

        careEpisode:
          careEpisode
            ? {
                id:
                  careEpisode.id,

                status:
                  careEpisode.status,

                startDate:
                  careEpisode.startDate,

                expectedRecoveryDays:
                  careEpisode
                    .expectedRecoveryDays,

                daysRemaining:
                  careEpisode.status ===
                  'active'
                    ? computeRecovery(
                        careEpisode.startDate,
                        careEpisode
                          .expectedRecoveryDays
                      ).daysRemaining
                    : careEpisode
                        .daysRemaining,

                surgery:
                  surgery
                    ? {
                        id:
                          surgery.id,

                        surgeryName:
                          surgery
                            .surgeryName,

                        surgeryDate:
                          surgery
                            .surgeryDate,

                        startDate:
                          surgery
                            .startDate,

                        status:
                          surgery.status,
                      }
                    : null,
              }
            : null,
      };
    }
  );
}

/* =========================================================
   SOS - CANONICAL ROUTE
   ========================================================= */

router.get(
  '/sos-escalations',
  async (req, res) => {
    try {
      const alerts =
        await loadEscalatedSOS();

      return res.json(
        alerts
      );
    } catch (error) {
      console.error(
        'GET /admin/sos-escalations error:',
        error
      );

      return res.status(500).json({
        message:
          'Failed to load emergency escalations.',
      });
    }
  }
);

/* =========================================================
   SOS - COMPATIBILITY ALIAS
   ========================================================= */

router.get(
  '/sos',
  async (req, res) => {
    try {
      const alerts =
        await loadEscalatedSOS();

      return res.json(
        alerts
      );
    } catch (error) {
      console.error(
        'GET /admin/sos error:',
        error
      );

      return res.status(500).json({
        message:
          'Failed to load emergency escalations.',
      });
    }
  }
);

/* =========================================================
   SOS - ADMIN DISPATCH / RESOLVE
   ========================================================= */

router.patch(
  '/sos-escalations/:id/dispatch',
  async (req, res) => {
    try {
      const alert =
        await SOSAlert.findByPk(
          req.params.id
        );

      if (!alert) {
        return res.status(404).json({
          message:
            'Emergency alert not found.',
        });
      }

      if (
        alert.status !==
        'escalated_admin'
      ) {
        return res.status(400).json({
          message:
            'Only escalated emergency alerts can be dispatched.',
        });
      }

      alert.status =
        'resolved';

      alert.resolvedBy =
        req.user.id;

      alert.adminAcknowledgedAt =
        new Date();

      alert.resolvedAt =
        new Date();

      await alert.save();

      const io =
        req.app.get('io');

      const alertPayload = {
        alertId:
          alert.id,

        patientId:
          alert.patientId,

        doctorId:
          alert.doctorId,

        careEpisodeId:
          alert.careEpisodeId,
      };

      /*
       * Admins should see it drop off every escalation queue
       * they have open, and the patient's app should be able
       * to reflect that help is on the way.
       */
      notifyAdmins(
        io,
        'sos_resolved',
        alertPayload
      );

      notifyUser(
        io,
        alert.patientId,
        'sos_resolved',
        alertPayload
      );

      return res.json({
        message:
          'Emergency dispatch initiated and alert resolved.',

        alert: {
          id:
            alert.id,

          status:
            alert.status,

          resolvedBy:
            alert.resolvedBy,

          adminAcknowledgedAt:
            alert.adminAcknowledgedAt,

          resolvedAt:
            alert.resolvedAt,
        },
      });
    } catch (error) {
      console.error(
        'PATCH /admin/sos-escalations/:id/dispatch error:',
        error
      );

      return res.status(500).json({
        message:
          'Failed to dispatch emergency alert.',
      });
    }
  }
);

/* =========================================================
   APPOINTMENT SLOT TIMES
   ========================================================= */

/*
 * Slot times are per doctor and per date: the admin publishes the
 * exact times a given doctor can be booked on a given day, and
 * patients can only book into those (see the patient booking
 * routes, which validate the requested doctor/date/time against
 * this table).
 */

const SLOT_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SLOT_TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;


router.get(
  '/slot-times',
  async (req, res) => {
    try {
      const { doctorId, date } = req.query;

      if (!doctorId || !SLOT_DATE_RE.test(date || '')) {
        return res.status(400).json({
          error: 'A doctor and a date (YYYY-MM-DD) are required.',
        });
      }

      const slots = await AppointmentSlot.findAll({
        where: { doctorId, date, isActive: true },
        order: [['time', 'ASC']],
      });

      res.json({ slots });
    } catch (error) {
      console.error('GET /admin/slot-times error:', error);

      res.status(500).json({
        error: 'Unable to load slot times.',
      });
    }
  }
);

router.post(
  '/slot-times',
  async (req, res) => {
    try {
      const { doctorId, date, time } = req.body;
      const normalizedTime = typeof time === 'string' ? time.trim() : '';

      if (!SLOT_TIME_RE.test(normalizedTime)) {
        return res.status(400).json({
          error: 'Time must be in 24-hour HH:MM format, e.g. 09:15.',
        });
      }

      if (!SLOT_DATE_RE.test(date || '') || date < todayInAppTz()) {
        return res.status(400).json({
          error: 'Choose today or a future date.',
        });
      }

      const doctor = doctorId
        ? await User.findOne({ where: { id: doctorId, role: 'doctor' } })
        : null;

      if (!doctor) {
        return res.status(404).json({
          error: 'Doctor not found.',
        });
      }

      const existing = await AppointmentSlot.findOne({
        where: { doctorId, date, time: normalizedTime },
      });

      if (existing) {
        if (existing.isActive) {
          return res.status(409).json({
            error: 'That slot already exists for this doctor on this day.',
          });
        }

        existing.isActive = true;
        await existing.save();

        return res.status(200).json({ slot: existing });
      }

      const slot = await AppointmentSlot.create({
        doctorId,
        date,
        time: normalizedTime,
        isActive: true,
      });

      res.status(201).json({ slot });
    } catch (error) {
      console.error('POST /admin/slot-times error:', error);

      res.status(500).json({
        error: 'Unable to create slot time.',
      });
    }
  }
);

router.delete(
  '/slot-times/:id',
  async (req, res) => {
    try {
      const slot = await AppointmentSlot.findByPk(req.params.id);

      if (!slot) {
        return res.status(404).json({
          error: 'Slot time not found.',
        });
      }

      /*
       * Soft-delete (deactivate) rather than hard-delete: existing
       * appointments that were booked into this time should not
       * become unexplainable in historical records just because
       * the admin later retired the slot.
       */
      slot.isActive = false;
      await slot.save();

      res.json({ message: 'Slot time removed.' });
    } catch (error) {
      console.error('DELETE /admin/slot-times/:id error:', error);

      res.status(500).json({
        error: 'Unable to remove slot time.',
      });
    }
  }
);

module.exports = router;