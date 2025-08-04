module.exports = (sequelize, DataTypes) => {
  const Region = sequelize.define('Region', {
    //name: DataTypes.STRING,
    name: DataTypes.JSON,
    description: DataTypes.JSON,
    type: {
      type: DataTypes.STRING, // country, province, county, city, other
      validate: {
        isProperValue(value) {
          if (
            value != 'country' &&
            value != 'province' &&
            value != 'county' &&
            value != 'city' &&
            value != 'other'
          ) {
            throw new Error('Only "country", "province", "county", "city", "other" values are allowed!');
          }
        }
      }
    },
    defaultPostCode: DataTypes.STRING,
    rule: DataTypes.STRING,
    weight: DataTypes.INTEGER,
    isDefault: { type: DataTypes.BOOLEAN, },
    isShownInSearch: { type: DataTypes.BOOLEAN, },
    isShownInZone: { type: DataTypes.BOOLEAN, },
    fias: DataTypes.JSON,
    fiasGUID: DataTypes.UUID,
    fiasParentGUID: DataTypes.UUID,
    kladrCode: DataTypes.STRING,
  }, {
    indexes: [
      {
        unique: true,
        fields: ['CountryId', 'isDefault'],
      }
    ]
});

  Region.associate = function(models) {
    models.Region.belongsTo(models.Country);
    models.Region.hasMany(models.RegionRule, {
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    models.Region.hasMany(models.ZoneRegionFrom);
    models.Region.hasMany(models.ZoneRegionTo);

    models.Region.belongsToMany(models.Zone, {
      as: 'RegionsFrom',
      through: models.ZoneRegionFrom,
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    models.Region.belongsToMany(models.Zone, {
      as: 'RegionsTo',
      through: models.ZoneRegionTo,
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  };

  return Region;
};
