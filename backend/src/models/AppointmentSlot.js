const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

/*
 * Admin-configured, hospital-wide recurring time-of-day slots
 * (e.g. "09:00", "09:15", "09:30" ...). These are not tied to a
 * specific calendar date - they represent the times of day a
 * patient is allowed to book into, every day. Whether a given
 * slot is actually free on a given date is worked out at booking
 * time by checking existing Appointment rows for that doctor,
 * date, and time - this table only defines *which times exist*,
 * not which are taken.
 */
const AppointmentSlot = sequelize.define(
  'AppointmentSlot',
  {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },

    time: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
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
    tableName: 'appointment_slots',
    timestamps: true,
  }
);

module.exports = AppointmentSlot;
