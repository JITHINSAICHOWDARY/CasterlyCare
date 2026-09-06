const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Surgery = sequelize.define(
  'Surgery',
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

    surgeryName: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    surgeryDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    description: {
      type: DataTypes.TEXT,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM('active', 'completed'),
      allowNull: false,
      defaultValue: 'active',
    },

    /*
     * Legacy recovery fields are retained for compatibility with the
     * existing application/database during the transition.
     *
     * The new CareEpisode model is the source of truth for the
     * temporary doctor-patient recovery relationship.
     */
    recoveryTotalDays: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 14,
      validate: {
        min: 1,
      },
    },

    recoveryDaysRemaining: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 14,
      validate: {
        min: 0,
      },
    },

    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    dischargeDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  },
  {
    tableName: 'surgeries',
    timestamps: true,

    indexes: [
      {
        fields: ['patientId'],
      },
      {
        fields: ['doctorId'],
      },
      {
        fields: ['status'],
      },
    ],
  }
);

module.exports = Surgery;