module.exports = (sequelize, DataTypes) => {
  const ZoneRegionFrom = sequelize.define('ZoneRegionFrom', {

  }, { timestamps: false });

  ZoneRegionFrom.associate = function(models) {
    models.ZoneRegionFrom.belongsTo(models.Zone);
    models.ZoneRegionFrom.belongsTo(models.Region);
  };

  return ZoneRegionFrom;
};
