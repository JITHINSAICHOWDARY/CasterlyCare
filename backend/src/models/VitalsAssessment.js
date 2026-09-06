const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const VitalsAssessment = sequelize.define(
  'VitalsAssessment',
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

    careEpisodeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    measuredAt: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },

    modelVersion: {
      type: DataTypes.STRING(100),
      allowNull: false,
      defaultValue: 'v1-baseline',
    },

    spo2: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    systolic: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    diastolic: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    heartRate: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    temperature: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    anomalyScore: {
      type: DataTypes.FLOAT,
      allowNull: false,
    },

    anomalyLabel: {
      type: DataTypes.ENUM('normal', 'outlier'),
      allowNull: false,
    },

    /*
     * Retained for backwards compatibility with the existing
     * assessment implementation.
     *
     * The patient-facing application should not expose these
     * simplistic labels directly. Phase 3 will replace the
     * presentation with professional monitoring language and
     * longitudinal data-drift / trajectory analysis.
     */
    trendLabel: {
      type: DataTypes.ENUM(
        'Improving',
        'Stable',
        'Requires Attention',
        'Insufficient Data'
      ),
      allowNull: false,
      defaultValue: 'Insufficient Data',
    },
  },
  {
    tableName: 'vitals_assessments',
    timestamps: true,

    indexes: [
      {
        fields: ['patientId'],
        name: 'vitals_assessments_patient_id',
      },
      {
        fields: ['careEpisodeId'],
        name: 'vitals_assessments_care_episode_id',
      },
      {
        fields: ['patientId', 'measuredAt'],
        name: 'vitals_assessments_patient_measured_at',
      },
      {
        fields: ['careEpisodeId', 'measuredAt'],
        name: 'vitals_assessments_episode_measured_at',
      },
    ],
  }
);

module.exports = VitalsAssessment;