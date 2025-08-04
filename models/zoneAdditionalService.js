module.exports = (sequelize, DataTypes) => {
  const ZoneAdditionalService = sequelize.define('ZoneAdditionalService', {

  }, { timestamps: false });

  ZoneAdditionalService.associate = function(models) {
    models.ZoneRegionFrom.belongsTo(models.Zone);
    //models.ZoneRegionFrom.belongsTo(models.AdditionalService);
  };

  return ZoneAdditionalService;
};
