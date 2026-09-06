const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const ChatMessage = sequelize.define('ChatMessage', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  threadId: { type: DataTypes.UUID, allowNull: false },
  senderRole: { type: DataTypes.ENUM('doctor', 'patient'), allowNull: false },
  content: { type: DataTypes.TEXT, allowNull: false },
}, {
  tableName: 'chat_messages',
  timestamps: true,
});

module.exports = ChatMessage;
