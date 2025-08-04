module.exports = (sequelize, DataTypes) => {
  const Package = sequelize.define('Package', {
    quantity: DataTypes.INTEGER,
    weight: DataTypes.FLOAT,
    volumeWeight: DataTypes.FLOAT,
    width: DataTypes.FLOAT,
    height: DataTypes.FLOAT,
    depth: DataTypes.FLOAT,
  });

  Package.associate = function(models) {
    models.Package.belongsTo(models.Order);
  };

  return Package;
};
