const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const DoctorProfile = sequelize.define('DoctorProfile', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    unique: true,
  },
  uniqueDoctorId: {
    // The code a doctor hands a patient after surgery, e.g. "DOC-7F3K9Q"
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  specialization: DataTypes.STRING,
  dutyStatus: {
    type: DataTypes.ENUM('on_duty', 'off_duty'),
    defaultValue: 'on_duty',
  },
  bio: DataTypes.TEXT,
}, {
  tableName: 'doctor_profiles',
  timestamps: true,
});

module.exports = DoctorProfile;
