module.exports = (sequelize, DataTypes) => {
  const PackageType = sequelize.define('PackageType', {
    type: { type: DataTypes.STRING, unique: true },
    defaultWeight: DataTypes.FLOAT,
    defaultWidth: DataTypes.FLOAT,
    defaultHeight: DataTypes.FLOAT,
    defaultDepth: DataTypes.FLOAT,
  });

  PackageType.associate = function(models) {
    models.PackageType.hasMany(models.Rate, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    });
    models.PackageType.hasMany(models.RateParam, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    });
  };

  return PackageType;
};
