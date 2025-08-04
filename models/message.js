module.exports = (sequelize, DataTypes) => {
  const Message = sequelize.define('Message', {
    text: DataTypes.TEXT,
    attachments: DataTypes.JSON,
    isRead: { type: DataTypes.BOOLEAN, defaultValue: false },
  });

  Message.associate = function(models) {
    models.Message.belongsTo(models.User, {
      as: 'ThreadUser',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    models.Message.belongsTo(models.User, {
      as: 'SenderUser',
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  };

  return Message;
};
