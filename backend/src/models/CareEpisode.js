const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const CareEpisode = sequelize.define(
  'CareEpisode',
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

    doctorId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    surgeryId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    status: {
      type: DataTypes.ENUM('active', 'completed'),
      allowNull: false,
      defaultValue: 'active',
    },

    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    expectedRecoveryDays: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 14,
      validate: {
        min: 1,
      },
    },

    daysRemaining: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 14,
      validate: {
        min: 0,
      },
    },

    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    dischargeDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  },
  {
    tableName: 'care_episodes',
    timestamps: true,

    indexes: [
      {
        fields: ['patientId', 'status'],
      },
      {
        fields: ['doctorId', 'status'],
      },
      {
        fields: ['surgeryId'],
      },
    ],
  }
);

module.exports = CareEpisode;