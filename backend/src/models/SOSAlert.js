const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const SOSAlert = sequelize.define(
  'SOSAlert',
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

    /*
     * The exact recovery episode during which
     * the emergency was triggered.
     *
     * Nullable temporarily so existing SOS records
     * remain valid during migration.
     */
    careEpisodeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    status: {
      type: DataTypes.ENUM(
        'pending',
        'acknowledged',
        'escalated_admin',
        'resolved'
      ),
      allowNull: false,
      defaultValue: 'pending',
    },

    /*
     * Snapshot fields preserve what was shown at the
     * moment the emergency was triggered.
     */
    patientNameSnapshot: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    surgerySnapshot: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    bloodGroupSnapshot: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    acknowledgedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    escalatedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    adminAcknowledgedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    resolvedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    resolvedBy: {
      type: DataTypes.UUID,
      allowNull: true,
    },
  },
  {
    tableName: 'sos_alerts',
    timestamps: true,

    indexes: [
      {
        fields: ['patientId'],
      },

      {
        fields: ['doctorId'],
      },

      {
        fields: ['careEpisodeId'],
      },

      {
        fields: ['status'],
      },

      {
        fields: [
          'doctorId',
          'status',
        ],
      },
    ],
  }
);

module.exports = SOSAlert;