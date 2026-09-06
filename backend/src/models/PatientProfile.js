const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const PatientProfile = sequelize.define('PatientProfile', {
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
  address: DataTypes.STRING,
  bloodGroup: DataTypes.STRING,
  dateOfBirth: DataTypes.DATEONLY,
  gender: DataTypes.STRING,
  emergencyContact: DataTypes.STRING,
  allergies: DataTypes.TEXT,
}, {
  tableName: 'patient_profiles',
  timestamps: true,
});

module.exports = PatientProfile;
