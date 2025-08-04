module.exports = (sequelize, DataTypes) => {
  const PushToken = sequelize.define('PushToken', {
    pushToken: DataTypes.STRING,
  });

  PushToken.associate = function(models) {
    models.PushToken.belongsTo(models.User);
  };

  return PushToken;
};
