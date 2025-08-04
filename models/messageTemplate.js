module.exports = (sequelize, DataTypes) => {
  const MessageTemplate = sequelize.define('MessageTemplate', {
    name: DataTypes.STRING,
    text: DataTypes.TEXT,
    order: DataTypes.INTEGER,
  });

  MessageTemplate.associate = function(models) {

  };

  return MessageTemplate;
};
