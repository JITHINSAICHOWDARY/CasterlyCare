const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ChatThread = sequelize.define(
  'ChatThread',
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
     * Each emergency conversation belongs to the
     * recovery episode in which it was opened.
     *
     * Nullable during migration so existing historical
     * conversations remain valid.
     */
    careEpisodeId: {
      type: DataTypes.UUID,
      allowNull: true,
    },

    /*
     * Temporary identifier for the individual issue.
     * Example: CHAT-4F2A7
     */
    chatCode: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },

    status: {
      type: DataTypes.ENUM(
        'open',
        'closed'
      ),
      allowNull: false,
      defaultValue: 'open',
    },

    closedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: 'chat_threads',
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

module.exports = ChatThread;