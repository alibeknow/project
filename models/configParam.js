module.exports = (sequelize, DataTypes) => {
  const ConfigParam = sequelize.define('ConfigParam', {
    param: DataTypes.STRING,
    value: DataTypes.JSON,
  });

  ConfigParam.associate = function(models) {

  };

  return ConfigParam;
};
