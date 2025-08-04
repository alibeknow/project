module.exports = (sequelize, DataTypes) => {
  const ZoneRegionTo = sequelize.define('ZoneRegionTo', {

  }, { timestamps: false });

  ZoneRegionTo.associate = function(models) {
    models.ZoneRegionTo.belongsTo(models.Zone);
    models.ZoneRegionTo.belongsTo(models.Region);
  };

  return ZoneRegionTo;
};
