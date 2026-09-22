const sequelize = require('../config/db');

const User = require('./User');
const DoctorProfile = require('./DoctorProfile');
const PatientProfile = require('./PatientProfile');
const Surgery = require('./Surgery');
const CareEpisode = require('./CareEpisode');
const MedicalFile = require('./MedicalFile');
const DoctorNote = require('./DoctorNote');
const Medicine = require('./Medicine');
const FoodRestriction = require('./FoodRestriction');
const Appointment = require('./Appointment');
const SOSAlert = require('./SOSAlert');
const ChatThread = require('./ChatThread');
const ChatMessage = require('./ChatMessage');
const VitalsAssessment = require('./VitalsAssessment');
const AppointmentSlot = require('./AppointmentSlot');
const OtpCode = require('./OtpCode');

/* =========================================================
   USER ↔ PROFILE
   ========================================================= */

User.hasOne(DoctorProfile, {
  foreignKey: 'userId',
  as: 'doctorProfile',
  onDelete: 'CASCADE',
});

DoctorProfile.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});

User.hasOne(PatientProfile, {
  foreignKey: 'userId',
  as: 'patientProfile',
  onDelete: 'CASCADE',
});

PatientProfile.belongsTo(User, {
  foreignKey: 'userId',
  as: 'user',
});

/* =========================================================
   SURGERY
   ========================================================= */

/*
  Surgery is the permanent historical medical event.

  A patient can have many surgeries over time.
  A doctor can perform many surgeries over time.
*/

User.hasMany(Surgery, {
  foreignKey: 'patientId',
  as: 'surgeriesAsPatient',
});

User.hasMany(Surgery, {
  foreignKey: 'doctorId',
  as: 'surgeriesAsDoctor',
});

Surgery.belongsTo(User, {
  foreignKey: 'patientId',
  as: 'patient',
});

Surgery.belongsTo(User, {
  foreignKey: 'doctorId',
  as: 'doctor',
});

/* =========================================================
   CARE EPISODE
   ========================================================= */

/*
  CareEpisode is the temporary doctor ↔ patient recovery
  relationship.

  Patient
      ↓
  CareEpisode
      ├── Doctor
      └── Surgery

  When recovery is completed, the CareEpisode becomes
  "completed", while the Surgery remains permanently
  available in the patient's history.
*/

User.hasMany(CareEpisode, {
  foreignKey: 'patientId',
  as: 'careEpisodesAsPatient',
});

User.hasMany(CareEpisode, {
  foreignKey: 'doctorId',
  as: 'careEpisodesAsDoctor',
});

Surgery.hasMany(CareEpisode, {
  foreignKey: 'surgeryId',
  as: 'careEpisodes',
});

CareEpisode.belongsTo(User, {
  foreignKey: 'patientId',
  as: 'patient',
});

CareEpisode.belongsTo(User, {
  foreignKey: 'doctorId',
  as: 'doctor',
});

CareEpisode.belongsTo(Surgery, {
  foreignKey: 'surgeryId',
  as: 'surgery',
});

/* =========================================================
   MEDICAL FILES
   ========================================================= */

User.hasMany(MedicalFile, {
  foreignKey: 'patientId',
  as: 'medicalFiles',
});

User.hasMany(MedicalFile, {
  foreignKey: 'uploadedByDoctorId',
  as: 'uploadedMedicalFiles',
});

Surgery.hasMany(MedicalFile, {
  foreignKey: 'surgeryId',
  as: 'medicalFiles',
});

CareEpisode.hasMany(MedicalFile, {
  foreignKey: 'careEpisodeId',
  as: 'medicalFiles',
});

MedicalFile.belongsTo(User, {
  foreignKey: 'patientId',
  as: 'patient',
});

MedicalFile.belongsTo(User, {
  foreignKey: 'uploadedByDoctorId',
  as: 'uploadedByDoctor',
});

MedicalFile.belongsTo(Surgery, {
  foreignKey: 'surgeryId',
  as: 'surgery',
});

MedicalFile.belongsTo(CareEpisode, {
  foreignKey: 'careEpisodeId',
  as: 'careEpisode',
});

/* =========================================================
   DOCTOR PRIVATE NOTES
   ========================================================= */

User.hasMany(DoctorNote, {
  foreignKey: 'patientId',
  as: 'doctorNotesForPatient',
});

User.hasMany(DoctorNote, {
  foreignKey: 'doctorId',
  as: 'doctorNotesCreated',
});

Surgery.hasMany(DoctorNote, {
  foreignKey: 'surgeryId',
  as: 'doctorNotes',
});

CareEpisode.hasMany(DoctorNote, {
  foreignKey: 'careEpisodeId',
  as: 'doctorNotes',
});

DoctorNote.belongsTo(User, {
  foreignKey: 'patientId',
  as: 'patient',
});

DoctorNote.belongsTo(User, {
  foreignKey: 'doctorId',
  as: 'doctor',
});

DoctorNote.belongsTo(Surgery, {
  foreignKey: 'surgeryId',
  as: 'surgery',
});

DoctorNote.belongsTo(CareEpisode, {
  foreignKey: 'careEpisodeId',
  as: 'careEpisode',
});

/* =========================================================
   MEDICINES
   ========================================================= */

User.hasMany(Medicine, {
  foreignKey: 'patientId',
  as: 'medicines',
});

User.hasMany(Medicine, {
  foreignKey: 'doctorId',
  as: 'prescribedMedicines',
});

Surgery.hasMany(Medicine, {
  foreignKey: 'surgeryId',
  as: 'medicines',
});

CareEpisode.hasMany(Medicine, {
  foreignKey: 'careEpisodeId',
  as: 'medicines',
});

Medicine.belongsTo(User, {
  foreignKey: 'patientId',
  as: 'patient',
});

Medicine.belongsTo(User, {
  foreignKey: 'doctorId',
  as: 'doctor',
});

Medicine.belongsTo(Surgery, {
  foreignKey: 'surgeryId',
  as: 'surgery',
});

Medicine.belongsTo(CareEpisode, {
  foreignKey: 'careEpisodeId',
  as: 'careEpisode',
});

/* =========================================================
   FOOD RESTRICTIONS
   ========================================================= */

User.hasMany(FoodRestriction, {
  foreignKey: 'patientId',
  as: 'foodRestrictions',
});

User.hasMany(FoodRestriction, {
  foreignKey: 'doctorId',
  as: 'createdFoodRestrictions',
});

Surgery.hasMany(FoodRestriction, {
  foreignKey: 'surgeryId',
  as: 'foodRestrictions',
});

CareEpisode.hasMany(FoodRestriction, {
  foreignKey: 'careEpisodeId',
  as: 'foodRestrictions',
});

FoodRestriction.belongsTo(User, {
  foreignKey: 'patientId',
  as: 'patient',
});

FoodRestriction.belongsTo(User, {
  foreignKey: 'doctorId',
  as: 'doctor',
});

FoodRestriction.belongsTo(Surgery, {
  foreignKey: 'surgeryId',
  as: 'surgery',
});

FoodRestriction.belongsTo(CareEpisode, {
  foreignKey: 'careEpisodeId',
  as: 'careEpisode',
});

/* =========================================================
   APPOINTMENTS
   ========================================================= */

User.hasMany(Appointment, {
  foreignKey: 'patientId',
  as: 'appointmentsAsPatient',
});

User.hasMany(Appointment, {
  foreignKey: 'doctorId',
  as: 'appointmentsAsDoctor',
});

CareEpisode.hasMany(Appointment, {
  foreignKey: 'careEpisodeId',
  as: 'appointments',
});

Appointment.belongsTo(User, {
  foreignKey: 'patientId',
  as: 'patient',
});

Appointment.belongsTo(User, {
  foreignKey: 'doctorId',
  as: 'doctor',
});

Appointment.belongsTo(CareEpisode, {
  foreignKey: 'careEpisodeId',
  as: 'careEpisode',
});

/* =========================================================
   SOS ALERTS
   ========================================================= */

User.hasMany(SOSAlert, {
  foreignKey: 'patientId',
  as: 'sosAsPatient',
});

User.hasMany(SOSAlert, {
  foreignKey: 'doctorId',
  as: 'sosAsDoctor',
});

CareEpisode.hasMany(SOSAlert, {
  foreignKey: 'careEpisodeId',
  as: 'sosAlerts',
});

SOSAlert.belongsTo(User, {
  foreignKey: 'patientId',
  as: 'patient',
});

SOSAlert.belongsTo(User, {
  foreignKey: 'doctorId',
  as: 'doctor',
});

SOSAlert.belongsTo(CareEpisode, {
  foreignKey: 'careEpisodeId',
  as: 'careEpisode',
});

/* =========================================================
   CHAT THREADS
   ========================================================= */

User.hasMany(ChatThread, {
  foreignKey: 'patientId',
  as: 'threadsAsPatient',
});

User.hasMany(ChatThread, {
  foreignKey: 'doctorId',
  as: 'threadsAsDoctor',
});

CareEpisode.hasMany(ChatThread, {
  foreignKey: 'careEpisodeId',
  as: 'chatThreads',
});

ChatThread.belongsTo(User, {
  foreignKey: 'patientId',
  as: 'patient',
});

ChatThread.belongsTo(User, {
  foreignKey: 'doctorId',
  as: 'doctor',
});

ChatThread.belongsTo(CareEpisode, {
  foreignKey: 'careEpisodeId',
  as: 'careEpisode',
});

ChatThread.hasMany(ChatMessage, {
  foreignKey: 'threadId',
  as: 'messages',
});

ChatMessage.belongsTo(ChatThread, {
  foreignKey: 'threadId',
  as: 'thread',
});

/* =========================================================
   VITALS / ASSESSMENTS
   ========================================================= */

User.hasMany(VitalsAssessment, {
  foreignKey: 'patientId',
  as: 'vitalsAssessments',
});

CareEpisode.hasMany(VitalsAssessment, {
  foreignKey: 'careEpisodeId',
  as: 'vitalsAssessments',
});

VitalsAssessment.belongsTo(User, {
  foreignKey: 'patientId',
  as: 'patient',
});

VitalsAssessment.belongsTo(CareEpisode, {
  foreignKey: 'careEpisodeId',
  as: 'careEpisode',
});

/* =========================================================
   EXPORTS
   ========================================================= */

module.exports = {
  sequelize,
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
  OtpCode,
};