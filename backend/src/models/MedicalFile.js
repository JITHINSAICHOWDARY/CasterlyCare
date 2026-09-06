const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const MedicalFile = sequelize.define(
  'MedicalFile',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    patientId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    surgeryId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    careEpisodeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    uploadedByDoctorId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    label: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    fileUrl: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    fileType: {
      type: DataTypes.ENUM('pdf', 'jpg', 'png'),
      allowNull: false,
    },

    fileSize: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
  },
  {
    tableName: 'medical_files',
    timestamps: true,

    indexes: [
      {
        fields: ['patientId'],
      },
      {
        fields: ['surgeryId'],
      },
      {
        fields: ['uploadedByDoctorId'],
      },
    ],
  }
);

module.exports = MedicalFile;