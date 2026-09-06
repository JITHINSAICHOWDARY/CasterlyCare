const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');

const sequelize = require('../config/db');

const {
  User,
  DoctorProfile,
  PatientProfile,
  Surgery,
  CareEpisode,
} = require('../models');

const { authenticate } = require('../middleware/auth');

const router = express.Router();

/* =========================================================
   HELPERS
   ========================================================= */

function signToken(user) {
  return jwt.sign(
    {
      id: user.id,
      role: user.role,
      email: user.email,
      name: user.name,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: '7d',
    }
  );
}

function publicUser(user) {
  return {
    id: user.id,
    role: user.role,
    email: user.email,
    name: user.name,
    photoUrl: user.photoUrl,
  };
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

/* =========================================================
   LOGIN
   ========================================================= */

router.post(
  '/login',
  [
    body('email')
      .isEmail()
      .withMessage(
        'Please enter a valid email address.'
      ),

    body('password')
      .notEmpty()
      .withMessage(
        'Password is required.'
      ),
  ],
  async (req, res) => {
    try {
      const errors =
        validationResult(req);

      if (!errors.isEmpty()) {
        return res.status(400).json({
          error:
            'Please enter a valid email and password.',
          errors:
            errors.array(),
        });
      }

      const email =
        String(req.body.email)
          .toLowerCase()
          .trim();

      const password =
        String(req.body.password);

      const user =
        await User.findOne({
          where: {
            email,
          },
        });

      if (!user) {
        return res.status(401).json({
          error:
            'Incorrect email or password.',
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          error:
            'This account has been deactivated. Please contact the hospital administrator.',
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
            'Incorrect email or password.',
        });
      }

      const token =
        signToken(user);

      return res.json({
        token,
        user:
          publicUser(user),
      });
    } catch (error) {
      console.error(
        'POST /auth/login error:',
        error
      );

      return res.status(500).json({
        error:
          'Unable to complete login.',
      });
    }
  }
);

/* =========================================================
   STEP-UP AUTHENTICATION
   ========================================================= */

/*
 * Used for sensitive areas such as Lab Reports.
 *
 * A successful password verification creates a short-lived
 * token that is separate from the normal login JWT.
 */
router.post(
  '/step-up',
  authenticate,
  async (req, res) => {
    try {
      const {
        password,
      } = req.body;

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

      const user =
        await User.findByPk(
          req.user.id
        );

      if (!user) {
        return res.status(404).json({
          error:
            'User account not found.',
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
              user.id,

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
        'POST /auth/step-up error:',
        error
      );

      return res.status(500).json({
        error:
          'Unable to verify password.',
      });
    }
  }
);

/* =========================================================
   PATIENT SIGNUP
   ========================================================= */

/*
 * Patient signup creates:
 *
 * User
 *   ↓
 * PatientProfile
 *   ↓
 * permanent Surgery record
 *   ↓
 * temporary active CareEpisode
 *
 * Surgery is permanent history.
 * CareEpisode is the temporary doctor-patient relationship.
 */
router.post(
  '/signup',
  [
    body('name')
      .trim()
      .notEmpty()
      .withMessage(
        'Name is required.'
      ),

    body('email')
      .isEmail()
      .withMessage(
        'A valid email address is required.'
      ),

    body('password')
      .isLength({
        min: 6,
      })
      .withMessage(
        'Password must be at least 6 characters.'
      ),

    body('doctorUniqueId')
      .trim()
      .notEmpty()
      .withMessage(
        'Doctor ID is required.'
      ),

    body('surgeryName')
      .trim()
      .notEmpty()
      .withMessage(
        'Surgery name is required.'
      ),

    body('phone')
      .optional({
        nullable: true,
      })
      .trim(),

    body('address')
      .optional({
        nullable: true,
      })
      .trim(),

    body('bloodGroup')
      .optional({
        nullable: true,
      })
      .trim(),

    body('recoveryTotalDays')
      .optional({
        nullable: true,
      }),
  ],
  async (req, res) => {
    const transaction =
      await sequelize.transaction();

    try {
      const errors =
        validationResult(req);

      if (!errors.isEmpty()) {
        await transaction.rollback();

        return res.status(400).json({
          error:
            errors.array()[0].msg,

          errors:
            errors.array(),
        });
      }

      const {
        name,
        email,
        password,
        doctorUniqueId,
        surgeryName,
        bloodGroup,
        phone,
        address,
        recoveryTotalDays,
      } = req.body;

      const normalizedEmail =
        String(email)
          .toLowerCase()
          .trim();

      const normalizedDoctorId =
        String(doctorUniqueId)
          .trim()
          .toUpperCase();

      const normalizedSurgeryName =
        String(surgeryName)
          .trim();

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

      /*
       * Find doctor by the unique Doctor ID.
       */
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

      /*
       * Make sure the doctor account still exists
       * and is actually a doctor.
       */
      const doctor =
        await User.findOne({
          where: {
            id:
              doctorProfile.userId,

            role:
              'doctor',
          },
        });

      if (!doctor) {
        await transaction.rollback();

        return res.status(404).json({
          error:
            'The selected doctor account could not be found.',
        });
      }

      if (!doctor.isActive) {
        await transaction.rollback();

        return res.status(403).json({
          error:
            'This doctor account is currently inactive. Please contact the hospital.',
        });
      }

      /*
       * Patient email must be unique.
       */
      const existing =
        await User.findOne({
          where: {
            email:
              normalizedEmail,
          },
        });

      if (existing) {
        await transaction.rollback();

        return res.status(409).json({
          error:
            'An account with this email already exists. Please log in instead.',
        });
      }

      const passwordHash =
        await bcrypt.hash(
          password,
          12
        );

      /*
       * Create patient account.
       */
      const patient =
        await User.create(
          {
            role:
              'patient',

            email:
              normalizedEmail,

            passwordHash,

            name:
              String(name).trim(),

            phone:
              phone
                ? String(
                    phone
                  ).trim()
                : null,

            isActive:
              true,
          },
          {
            transaction,
          }
        );

      /*
       * Create permanent patient profile.
       */
      await PatientProfile.create(
        {
          userId:
            patient.id,

          address:
            address
              ? String(
                  address
                ).trim()
              : null,

          bloodGroup:
            bloodGroup
              ? String(
                  bloodGroup
                ).trim()
              : null,
        },
        {
          transaction,
        }
      );

      /*
       * Permanent surgery history.
       */
      const surgery =
        await Surgery.create(
          {
            patientId:
              patient.id,

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

            status:
              'active',
          },
          {
            transaction,
          }
        );

      /*
       * Temporary doctor-patient recovery relationship.
       */
      const careEpisode =
        await CareEpisode.create(
          {
            patientId:
              patient.id,

            doctorId:
              doctor.id,

            surgeryId:
              surgery.id,

            status:
              'active',

            startDate:
              surgery.startDate,

            expectedRecoveryDays:
              recoveryDays,

            daysRemaining:
              recoveryDays,
          },
          {
            transaction,
          }
        );

      await transaction.commit();

      const token =
        signToken(patient);

      return res.status(201).json({
        token,

        user:
          publicUser(patient),

        surgery: {
          id:
            surgery.id,

          surgeryName:
            surgery.surgeryName,

          surgeryDate:
            surgery.surgeryDate,

          status:
            surgery.status,

          recoveryTotalDays:
            surgery.recoveryTotalDays,

          recoveryDaysRemaining:
            surgery.recoveryDaysRemaining,
        },

        careEpisode: {
          id:
            careEpisode.id,

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
            careEpisode.daysRemaining,
        },
      });
    } catch (error) {
      try {
        await transaction.rollback();
      } catch (rollbackError) {
        console.error(
          'Signup transaction rollback error:',
          rollbackError
        );
      }

      console.error(
        'POST /auth/signup error:',
        error
      );

      return res.status(500).json({
        error:
          'Unable to complete patient registration.',
      });
    }
  }
);

/* =========================================================
   CURRENT USER
   ========================================================= */

router.get(
  '/me',
  authenticate,
  async (req, res) => {
    try {
      const user =
        await User.findByPk(
          req.user.id
        );

      if (!user) {
        return res.status(404).json({
          error:
            'User not found.',
        });
      }

      if (!user.isActive) {
        return res.status(403).json({
          error:
            'This account has been deactivated.',
        });
      }

      return res.json({
        user:
          publicUser(user),
      });
    } catch (error) {
      console.error(
        'GET /auth/me error:',
        error
      );

      return res.status(500).json({
        error:
          'Unable to load current user.',
      });
    }
  }
);

module.exports = router;