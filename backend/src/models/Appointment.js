const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Appointment = sequelize.define(
  'Appointment',
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
     * Identifies the temporary recovery episode this
     * appointment belongs to.
     *
     * Nullable during migration so historical appointments
     * remain valid.
     */
    careEpisodeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    visitCategory: {
      type: DataTypes.ENUM(
        'home_visit',
        'hospital_visit'
      ),
      allowNull: false,
    },

    serviceType: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    /*
     * Stored as HH:mm.
     *
     * The frontend will provide an alarm-style time picker,
     * not free-form text.
     */
    time: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        is: /^([01]\d|2[0-3]):[0-5]\d$/,
      },
    },

    status: {
      type: DataTypes.ENUM(
        'upcoming',
        'completed',
        'cancelled'
      ),
      allowNull: false,
      defaultValue: 'upcoming',
    },

    notes: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    completedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },

    cancelledAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'appointments',
    timestamps: true,

    indexes: [
      {
        fields: [
          'doctorId',
          'date',
          'time',
        ],
      },

      {
        fields: [
          'patientId',
          'date',
          'time',
        ],
      },

      {
        fields: [
          'careEpisodeId',
        ],
      },

      {
        fields: [
          'status',
        ],
      },
    ],
  }
);

module.exports = Appointment;