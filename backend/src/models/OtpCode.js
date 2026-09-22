const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// One row per phone number — a new request overwrites the previous code.
// Not linked to a User row directly (lookup is by phone at verify time)
// since the whole point is authenticating before we've resolved who it is.
const OtpCode = sequelize.define('OtpCode', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  phone: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
  codeHash: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  expiresAt: {
    type: DataTypes.DATE,
    allowNull: false,
  },
  attempts: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
}, {
  tableName: 'otp_codes',
  timestamps: true,
});

module.exports = OtpCode;
