module.exports = (sequelize, DataTypes) => {
  const RateParam = sequelize.define('RateParam', {
    bookBefore: DataTypes.TIME,
    pickupBefore: DataTypes.TIME,
    workingDays: {
      type: DataTypes.ARRAY(DataTypes.ENUM({
        values: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'],
      }))
    },
    isMultiPackage: DataTypes.BOOLEAN,
    maxPackageWeight: DataTypes.FLOAT,
    maxPackageWidth: DataTypes.FLOAT,
    maxPackageHeight: DataTypes.FLOAT,
    maxPackageDepth: DataTypes.FLOAT,
    oversizeMultiplier: DataTypes.FLOAT,
    volumeWeightDivider: DataTypes.FLOAT,
  });

  RateParam.associate = function(models) {
    models.RateParam.belongsTo(models.Carrier);
    models.RateParam.belongsTo(models.PackageType);
    models.RateParam.belongsTo(models.RateType);
  };

  return RateParam;
};
