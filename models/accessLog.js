module.exports = (sequelize, DataTypes) => {
  const AccessLog = sequelize.define('AccessLog', {
    UserId: DataTypes.INTEGER,
    role: DataTypes.STRING,
    perm: DataTypes.STRING,
    ip: DataTypes.STRING,
    useragent: DataTypes.TEXT,
    hash: DataTypes.STRING,
    data: DataTypes.JSON,
  });

  AccessLog.associate = function(models) {
    models.AccessLog.belongsTo(models.User);
  };

  return AccessLog;
};
