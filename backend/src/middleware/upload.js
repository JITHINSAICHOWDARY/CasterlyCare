const multer = require('multer');
const path = require('path');
const fs = require('fs');

const ALLOWED = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
};

function makeStorage(subfolder) {
  const dest = path.join(__dirname, '..', '..', 'uploads', subfolder);
  fs.mkdirSync(dest, { recursive: true });
  return multer.diskStorage({
    destination: (req, file, cb) => cb(null, dest),
    filename: (req, file, cb) => {
      const ext = ALLOWED[file.mimetype] || 'bin';
      const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}.${ext}`;
      cb(null, unique);
    },
  });
}

function fileFilter(req, file, cb) {
  if (ALLOWED[file.mimetype]) return cb(null, true);
  const err = new Error('Only PDF, JPG, and PNG files are allowed.');
  err.status = 400;
  cb(err);
}

const uploadPatientFile = multer({
  storage: makeStorage('patient_files'),
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB
});

const uploadProfilePhoto = multer({
  storage: makeStorage('profile_photos'),
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'image/jpeg' || file.mimetype === 'image/png') return cb(null, true);
    const err = new Error('Profile photo must be JPG or PNG.');
    err.status = 400;
    cb(err);
  },
  limits: { fileSize: 5 * 1024 * 1024 },
});

module.exports = { uploadPatientFile, uploadProfilePhoto, ALLOWED };
