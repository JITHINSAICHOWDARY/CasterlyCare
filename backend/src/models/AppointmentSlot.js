const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

/*
 * A bookable time for one specific doctor on one specific date
 * (e.g. Dr Rao, 2026-09-24, "09:15"). Slots are not shared between
 * doctors or between days: the admin publishes them per doctor per
 * day, and a patient can only book a time that exists here for
 * their own doctor on the chosen date. Whether a slot is already
 * taken is worked out at booking time from the Appointment rows.
 *
 * Stored in its own table (doctor_slots): the earlier hospital-wide
 * appointment_slots table cannot be altered by sync() and is no
 * longer used.
 */
const AppointmentSlot = sequelize.define(
  'AppointmentSlot',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    doctorId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    date: {
      type: DataTypes.DATEONLY,
      allowNull: false,
    },

    time: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        is: /^([01]\d|2[0-3]):[0-5]\d$/,
      },
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },
  },
  {
    tableName: 'doctor_slots',
    timestamps: true,
    indexes: [
      { unique: true, fields: ['doctorId', 'date', 'time'] },
    ],
  }
);

module.exports = AppointmentSlot;
