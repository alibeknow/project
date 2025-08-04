module.exports = (sequelize, DataTypes) => {
  const Zone = sequelize.define('Zone', {
    name: DataTypes.JSON,
    hasVAT: { type: DataTypes.BOOLEAN, defaultValue: true },
    deliveryTimeFrom: DataTypes.INTEGER,
    deliveryTimeTo: DataTypes.INTEGER,
  });

  Zone.associate = function(models) {
    models.Zone.belongsTo(models.Carrier);

    models.Zone.hasMany(models.Rate, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    models.Zone.hasMany(models.ZoneRegionFrom);
    models.Zone.hasMany(models.ZoneRegionTo);
    models.Zone.belongsToMany(models.Region, {
      as: 'RegionsFrom',
      through: models.ZoneRegionFrom,
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    models.Zone.belongsToMany(models.Region, {
      as: 'RegionsTo',
      through: models.ZoneRegionTo,
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    models.Zone.hasMany(models.ZoneAdditionalService);
    models.Zone.belongsToMany(models.AdditionalService, {
      as: 'AdditionalServices',
      through: models.ZoneAdditionalService,
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  };

  return Zone;
};
