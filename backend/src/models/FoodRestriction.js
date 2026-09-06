const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const FoodRestriction = sequelize.define(
  'FoodRestriction',
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
     * Nullable during migration so existing records remain valid.
     */
    careEpisodeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    doctorId: {
      type: DataTypes.UUID,
      allowNull: false,
    },

    dietTemplate: {
      type: DataTypes.STRING,
      allowNull: true,
    },

    /*
     * Kept as TEXT for compatibility with the current application.
     * Example:
     *
     * "salt, pickle, processed meat, maida"
     */
    ingredientsToAvoid: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
  },
  {
    tableName: 'food_restrictions',
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

module.exports = FoodRestriction;