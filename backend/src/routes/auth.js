const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { OAuth2Client } = require('google-auth-library');
const { body, validationResult } = require('express-validator');

const sequelize = require('../config/db');

const {
  User,
  DoctorProfile,
  PatientProfile,
  Surgery,
  CareEpisode,
  OtpCode,
} = require('../models');

const { authenticate } = require('../middleware/auth');
const { generateOtpCode, sendOtpSms, smsConfigured } = require('../utils/otp');
const { normalizePhone, isValidPhone } = require('../utils/phone');
const { normalizeRecoveryDays } = require('../utils/recovery');

const router = express.Router();
const googleClient = process.env.GOOGLE_CLIENT_ID ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID) : null;
const OTP_TTL_MINUTES = 5;
const OTP_RESEND_COOLDOWN_SECONDS = 45;
const OTP_MAX_ATTEMPTS = 5;

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
      // Password version: changing the password changes this, so every token
      // issued before the change stops working (see middleware/auth.js).
      pv: user.passwordChangedAt ? new Date(user.passwordChangedAt).getTime() : 0,
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
   OTP LOGIN (mobile number)
   ========================================================= */

/*
 * OTP is an alternate way to sign in to an EXISTING account — it does not
 * create new accounts. Patient accounts are only created through the
 * doctor-ID signup flow above, so an unrecognized phone number here is
 * rejected the same way an unrecognized email is at /login.
 */
router.post(
  '/otp/request',
  async (req, res) => {
    try {
      const phone = normalizePhone(req.body.phone);
      if (!isValidPhone(phone)) {
        return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
      }

      const user = await User.findOne({ where: { phone } });
      if (user && !user.isActive) {
        return res.status(403).json({ error: 'This account has been deactivated. Please contact the hospital administrator.' });
      }

      // A missing account falls through to the same "sent" response below
      // instead of a distinct 404 — otherwise this endpoint would let
      // anyone enumerate which phone numbers have real accounts, unlike
      // /login next door, which never reveals that on its own.
      if (user) {
        const existing = await OtpCode.findOne({ where: { phone } });
        if (existing) {
          const secondsSinceLastSend = (Date.now() - new Date(existing.updatedAt).getTime()) / 1000;
          if (secondsSinceLastSend < OTP_RESEND_COOLDOWN_SECONDS) {
            return res.status(429).json({
              error: 'Please wait before requesting another code.',
              resendInSeconds: Math.ceil(OTP_RESEND_COOLDOWN_SECONDS - secondsSinceLastSend),
            });
          }
        }
      }

      let devCode;
      if (user) {
        const code = generateOtpCode();
        const codeHash = await bcrypt.hash(code, 10);
        const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

        await OtpCode.upsert({ phone, codeHash, expiresAt, attempts: 0 });
        await sendOtpSms(phone, code);

        // Fallback-mode only (no SMS provider configured) — never sent in production
        // once TWOFACTOR_API_KEY is set, matching the LLM integration's fallback pattern.
        if (!smsConfigured && process.env.NODE_ENV !== 'production') devCode = code;
      }

      return res.json({
        sent: true,
        resendInSeconds: OTP_RESEND_COOLDOWN_SECONDS,
        ...(devCode ? { devCode } : {}),
      });
    } catch (error) {
      console.error('POST /auth/otp/request error:', error);
      return res.status(500).json({ error: 'Unable to send verification code.' });
    }
  }
);

router.post(
  '/otp/verify',
  [body('code').trim().isLength({ min: 6, max: 6 }).withMessage('Enter the 6-digit code.')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const phone = normalizePhone(req.body.phone);
      if (!isValidPhone(phone)) {
        return res.status(400).json({ error: 'Enter a valid 10-digit mobile number.' });
      }
      const code = String(req.body.code).trim();

      const otp = await OtpCode.findOne({ where: { phone } });
      if (!otp || otp.expiresAt < new Date()) {
        return res.status(400).json({ error: 'That code has expired. Please request a new one.' });
      }
      if (otp.attempts >= OTP_MAX_ATTEMPTS) {
        await otp.destroy();
        return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
      }

      const valid = await bcrypt.compare(code, otp.codeHash);
      if (!valid) {
        await otp.increment('attempts');
        return res.status(400).json({ error: 'Incorrect code. Please try again.' });
      }

      const user = await User.findOne({ where: { phone } });
      if (!user || !user.isActive) {
        return res.status(403).json({ error: 'This account is not available.' });
      }

      await otp.destroy();

      const token = signToken(user);
      return res.json({ token, user: publicUser(user) });
    } catch (error) {
      console.error('POST /auth/otp/verify error:', error);
      return res.status(500).json({ error: 'Unable to verify code.' });
    }
  }
);

/* =========================================================
   GOOGLE SIGN-IN
   ========================================================= */

/*
 * Verifies the ID token from Google Identity Services (the credential
 * a "Sign in with Google" button hands back), then signs in the EXISTING
 * account matching that Google email — same reasoning as OTP above: this
 * app's accounts are provisioned via admin/doctor flows, not self-serve,
 * so a Google email with no matching account is rejected, not auto-created.
 */
router.post(
  '/google',
  [body('credential').notEmpty().withMessage('Missing Google credential.')],
  async (req, res) => {
    if (!googleClient) {
      return res.status(501).json({ error: 'Google sign-in is not configured on this server.' });
    }

    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: errors.array()[0].msg });
      }

      const ticket = await googleClient.verifyIdToken({
        idToken: req.body.credential,
        audience: process.env.GOOGLE_CLIENT_ID,
      });
      const payload = ticket.getPayload();
      const email = String(payload.email || '').toLowerCase().trim();

      if (!payload.email_verified || !email) {
        return res.status(401).json({ error: 'Google account email is not verified.' });
      }

      // Doesn't reveal a missing account distinctly from other failures —
      // otherwise this endpoint would let anyone enumerate which emails
      // have a CasterlyCare account by trying Google sign-in with them.
      const user = await User.findOne({ where: { email } });
      if (!user) {
        return res.status(401).json({ error: 'We could not sign you in with that Google account.' });
      }
      if (!user.isActive) {
        return res.status(403).json({ error: 'This account has been deactivated. Please contact the hospital administrator.' });
      }

      if (!user.googleId) {
        user.googleId = payload.sub;
        await user.save();
      }

      const token = signToken(user);
      return res.json({ token, user: publicUser(user) });
    } catch (error) {
      console.error('POST /auth/google error:', error);
      return res.status(400).json({ error: 'Unable to verify Google sign-in.' });
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

    body('acceptedTerms')
      .custom((value) => value === true)
      .withMessage(
        'You must accept the Terms and Privacy Policy to create an account.'
      ),

    body('surgeryName')
      .optional({
        nullable: true,
      })
      .trim(),

    body('phone')
      .optional({
        nullable: true,
      })
      .trim()
      .custom((value) => !value || isValidPhone(value))
      .withMessage('Enter a valid 10-digit mobile number.'),

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
        String(surgeryName || '')
          .trim() || 'Procedure pending';

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
                ? normalizePhone(phone)
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
   CHANGE PASSWORD
   ========================================================= */

// ponytail: in-memory attempt limiter, per process. Move to a shared store
// (Redis) if the API ever runs on more than one instance.
const passwordAttempts = new Map();
const PASSWORD_MAX_ATTEMPTS = 5;
const PASSWORD_WINDOW_MS = 15 * 60 * 1000;

router.post(
  '/change-password',
  authenticate,
  async (req, res) => {
    try {
      const { currentPassword, newPassword } = req.body || {};

      if (typeof currentPassword !== 'string' || typeof newPassword !== 'string' || !currentPassword || !newPassword) {
        return res.status(400).json({ error: 'Enter your current password and a new one.' });
      }

      if (newPassword.length < 8 || newPassword.length > 72) {
        return res.status(400).json({ error: 'The new password must be 8 to 72 characters long.' });
      }

      if (newPassword === currentPassword) {
        return res.status(400).json({ error: 'Choose a password different from your current one.' });
      }

      const now = Date.now();
      const entry = passwordAttempts.get(req.user.id);

      if (entry && entry.resetAt > now && entry.count >= PASSWORD_MAX_ATTEMPTS) {
        return res.status(429).json({
          error: 'Too many incorrect attempts. Try again in a few minutes.',
        });
      }

      const user = await User.findByPk(req.user.id);

      if (!user) {
        return res.status(404).json({ error: 'User not found.' });
      }

      const matches = await bcrypt.compare(currentPassword, user.passwordHash);

      if (!matches) {
        const fresh = entry && entry.resetAt > now ? entry : { count: 0, resetAt: now + PASSWORD_WINDOW_MS };
        fresh.count += 1;
        passwordAttempts.set(req.user.id, fresh);

        // 400, not 401: the client treats 401 as "session expired" and logs out.
        return res.status(400).json({ error: 'Your current password is incorrect.' });
      }

      passwordAttempts.delete(req.user.id);

      user.passwordHash = await bcrypt.hash(newPassword, 10);
      user.passwordChangedAt = new Date(now);
      await user.save();

      return res.json({
        message: 'Password changed. Other devices have been signed out.',
        token: signToken(user),
      });
    } catch (error) {
      console.error('POST /auth/change-password error:', error);

      return res.status(500).json({ error: 'Unable to change password.' });
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