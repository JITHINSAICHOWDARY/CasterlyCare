require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const morgan = require('morgan');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');

const sequelize = require('./config/db');
require('./models');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');
const doctorRoutes = require('./routes/doctor');
const patientRoutes = require('./routes/patient');

const {
  authenticate,
} = require('./middleware/auth');

const {
  MedicalFile,
  CareEpisode,
} = require('./models');

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin:
      process.env.CORS_ORIGIN || '*',
  },
});

app.set('io', io);

/*
 * =========================================================
 * SOCKET AUTHENTICATION + ROOM ASSIGNMENT
 * =========================================================
 *
 * The frontend already sends its JWT in the connection
 * handshake (`auth: { token }`), but until now nothing on
 * the server ever read it - connections were fully
 * anonymous, and route handlers were emitting events to
 * rooms (e.g. `doctor:${doctorId}`) that no socket had ever
 * joined. As a result the whole "real-time" layer only ever
 * appeared to work because dashboards separately poll on a
 * timer; SOS alerts and appointment changes were not
 * actually pushed to anyone.
 *
 * This verifies the token the same way the HTTP `authenticate`
 * middleware does, then joins every socket to rooms scoped to
 * its identity so route handlers can target the right
 * audience:
 *   - user:<id>          every authenticated connection
 *   - doctor:<id>         doctor connections only
 *   - role:admin          admin connections only
 */
io.use((socket, next) => {
  const token =
    socket.handshake?.auth?.token;

  if (!token) {
    return next(
      new Error('Authentication required.')
    );
  }

  try {
    const payload = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    socket.user = payload;
    next();
  } catch (err) {
    next(
      new Error('Invalid or expired session.')
    );
  }
});

io.on('connection', (socket) => {
  if (socket.user?.id) {
    socket.join(`user:${socket.user.id}`);

    if (socket.user.role === 'doctor') {
      socket.join(`doctor:${socket.user.id}`);
    }

    if (socket.user.role === 'admin') {
      socket.join('role:admin');
    }
  }

  socket.on(
    'join_thread',
    (threadId) => {
      if (threadId) {
        socket.join(
          `thread_${threadId}`
        );
      }
    }
  );

  socket.on(
    'leave_thread',
    (threadId) => {
      if (threadId) {
        socket.leave(
          `thread_${threadId}`
        );
      }
    }
  );
});

app.use(
  cors({
    origin:
      process.env.CORS_ORIGIN || '*',
  })
);

app.use(
  express.json({
    limit: '5mb',
  })
);

app.use(morgan('dev'));

/*
 * =========================================================
 * PUBLIC PROFILE PHOTO STORAGE
 * =========================================================
 *
 * Profile photos are not medical records, so they may remain
 * publicly accessible.
 */
const uploadsRoot =
  path.join(
    __dirname,
    '..',
    'uploads'
  );

const profilePhotosRoot =
  path.join(
    uploadsRoot,
    'profile_photos'
  );

app.use(
  '/uploads/profile_photos',
  express.static(
    profilePhotosRoot
  )
);

/*
 * IMPORTANT:
 *
 * We intentionally DO NOT expose the entire /uploads
 * directory with express.static().
 *
 * Patient medical files are served only through the
 * authenticated route below.
 */

/*
 * =========================================================
 * SECURE MEDICAL FILE ACCESS
 * =========================================================
 *
 * Existing MedicalFile records store URLs such as:
 *
 * /uploads/patient_files/<filename>
 *
 * The same URL can continue to be used by the frontend,
 * but it is no longer publicly accessible.
 *
 * Authorization:
 *
 * PATIENT
 *   -> may access only their own medical files.
 *
 * DOCTOR
 *   -> may access files belonging to a patient who is
 *      currently assigned to that doctor through an active
 *      CareEpisode.
 *
 * ADMIN
 *   -> intentionally denied here unless a later explicit
 *      administrative medical-record requirement is added.
 */
app.get(
  '/uploads/patient_files/:filename',
  authenticate,
  async (req, res) => {
    try {
      const filename =
        req.params.filename;

      /*
       * Reject suspicious path input.
       */
      if (
        !filename ||
        filename.includes('/') ||
        filename.includes('\\') ||
        filename === '.' ||
        filename === '..'
      ) {
        return res.status(400).json({
          error:
            'Invalid medical file reference.',
        });
      }

      const file = await MedicalFile.findOne({
        where: {
          fileUrl:
            `/uploads/patient_files/${filename}`,
        },
      });

      if (!file) {
        return res.status(404).json({
          error:
            'Medical file not found.',
        });
      }

      /*
       * Patient ownership.
       */
      if (
        req.user.role ===
        'patient'
      ) {
        if (
          file.patientId !==
          req.user.id
        ) {
          return res.status(403).json({
            error:
              'You are not authorized to access this medical file.',
          });
        }
      }

      /*
       * Doctor access requires an ACTIVE CareEpisode
       * connecting the doctor to this patient.
       */
      else if (
        req.user.role ===
        'doctor'
      ) {
        const activeEpisode =
          await CareEpisode.findOne({
            where: {
              doctorId:
                req.user.id,

              patientId:
                file.patientId,

              status:
                'active',
            },
          });

        if (!activeEpisode) {
          return res.status(403).json({
            error:
              'You are not currently authorized to access this patient medical file.',
          });
        }
      }

      /*
       * No administrative access is granted through this
       * endpoint by default.
       */
      else {
        return res.status(403).json({
          error:
            'You are not authorized to access medical files.',
        });
      }

      /*
       * Resolve the physical file path safely.
       */
      const expectedPrefix =
        '/uploads/patient_files/';

      if (
        !file.fileUrl ||
        !file.fileUrl.startsWith(
          expectedPrefix
        )
      ) {
        return res.status(500).json({
          error:
            'Medical file reference is invalid.',
        });
      }

      const physicalName =
        path.basename(
          file.fileUrl
            .slice(
              expectedPrefix.length
            )
        );

      if (
        physicalName !== filename
      ) {
        return res.status(400).json({
          error:
            'Invalid medical file reference.',
        });
      }

      const physicalPath =
        path.resolve(
          path.join(
            uploadsRoot,
            'patient_files',
            physicalName
          )
        );

      const patientFilesRoot =
        path.resolve(
          path.join(
            uploadsRoot,
            'patient_files'
          )
        );

      /*
       * Final path traversal protection.
       */
      if (
        physicalPath !==
          path.join(
            patientFilesRoot,
            physicalName
          ) ||
        !physicalPath.startsWith(
          `${patientFilesRoot}${path.sep}`
        )
      ) {
        return res.status(400).json({
          error:
            'Invalid medical file path.',
        });
      }

      let fileStats;

      try {
        fileStats =
          await fs.promises.stat(
            physicalPath
          );
      } catch (error) {
        return res.status(404).json({
          error:
            'Medical file content is unavailable.',
        });
      }

      if (
        !fileStats.isFile()
      ) {
        return res.status(404).json({
          error:
            'Medical file content is unavailable.',
        });
      }

      /*
       * Only serve the formats allowed by the clinical
       * file-upload policy.
       */
      const extension =
        path.extname(
          physicalName
        ).toLowerCase();

      const contentTypes = {
        '.pdf':
          'application/pdf',

        '.jpg':
          'image/jpeg',

        '.jpeg':
          'image/jpeg',

        '.png':
          'image/png',
      };

      const contentType =
        contentTypes[
          extension
        ];

      if (!contentType) {
        return res.status(415).json({
          error:
            'Unsupported medical file type.',
        });
      }

      res.setHeader(
        'Content-Type',
        contentType
      );

      res.setHeader(
        'Content-Length',
        fileStats.size
      );

      res.setHeader(
        'Content-Disposition',
        `inline; filename="${physicalName}"`
      );

      res.setHeader(
        'Cache-Control',
        'private, no-store, max-age=0'
      );

      res.setHeader(
        'X-Content-Type-Options',
        'nosniff'
      );

      return res.sendFile(
        physicalPath
      );
    } catch (error) {
      console.error(
        'Secure medical file access error:',
        error
      );

      return res.status(500).json({
        error:
          'Unable to access medical file.',
      });
    }
  }
);

/* =========================================================
   HEALTH
   ========================================================= */

app.get(
  '/api/health',
  (req, res) => {
    res.json({
      status: 'ok',
      service:
        'lannister-care-api',
    });
  }
);

/* =========================================================
   API ROUTES
   ========================================================= */

app.use(
  '/api/auth',
  authRoutes
);

app.use(
  '/api/admin',
  adminRoutes
);

app.use(
  '/api/doctor',
  doctorRoutes
);

app.use(
  '/api/patient',
  patientRoutes
);

/* =========================================================
   CENTRAL ERROR HANDLER
   ========================================================= */

app.use(
  (
    err,
    req,
    res,
    next
  ) => {
    console.error(err);

    /*
     * Multer raises its own error class (not a plain Error)
     * for problems like exceeding the file-size limit or an
     * unexpected field name. These are client mistakes, not
     * server failures, so they should never surface as a 500 -
     * the frontend explicitly replaces 5xx error text with a
     * generic "service unavailable" message, which would be
     * misleading here.
     */
    const isMulterError =
      err &&
      err.name === 'MulterError';

    let status =
      err.status || 500;

    if (isMulterError) {
      status =
        err.code === 'LIMIT_FILE_SIZE'
          ? 413
          : 400;
    }

    res.status(status).json({
      error:
        err.message ||
        'Something went wrong on our end. Please try again.',
    });
  }
);

/* =========================================================
   404
   ========================================================= */

app.use(
  (req, res) =>
    res.status(404).json({
      error:
        'Route not found.',
    })
);

/* =========================================================
   START SERVER
   ========================================================= */

const PORT =
  process.env.PORT || 5000;

const {
  startRecoveryScheduler,
} = require('./utils/scheduler');

sequelize
  .sync()
  .then(() => {
    server.listen(
      PORT,
      () => {
        console.log(
          `Lannister Care API listening on port ${PORT}`
        );

        startRecoveryScheduler();
      }
    );
  })
  .catch((err) => {
    console.error(
      'Failed to connect to database:',
      err
    );

    process.exit(1);
  });