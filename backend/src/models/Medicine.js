const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Medicine = sequelize.define(
  'Medicine',
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

    /*
     * Temporary recovery/care relationship.
     * Nullable during migration so existing historical
     * medicine records remain valid.
     */
    careEpisodeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    doctorId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    form: {
      type: DataTypes.ENUM(
        'Tablet',
        'Syrup',
        'Injection',
        'Ointment'
      ),
      allowNull: false,
      defaultValue: 'Tablet',
    },

    dosage: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    frequency: {
      type: DataTypes.STRING,
      allowNull: false,
    },

    /*
     * Alarm-style reminder times.
     *
     * Example:
     * ["08:00", "14:00", "20:00"]
     *
     * The frontend will use a time picker rather than
     * requiring the doctor to type times manually.
     */
    times: {
      type: DataTypes.JSON,
      allowNull: false,
      defaultValue: [],
    },

    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    },

    startDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    endDate: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },
  },
  {
    tableName: 'medicines',
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

module.exports = Medicine;