const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const DoctorNote = sequelize.define(
  'DoctorNote',
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

    doctorId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    content: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: 'doctor_notes',
    timestamps: true,

    indexes: [
      {
        fields: ['patientId'],
      },
      {
        fields: ['surgeryId'],
      },
      {
        fields: ['doctorId'],
      },
    ],
  }
);

module.exports = DoctorNote;