module.exports = (sequelize, DataTypes) => {
  const Country = sequelize.define('Country', {
    //name: DataTypes.STRING,
    name: DataTypes.JSON,
    code: DataTypes.STRING,
    description: DataTypes.JSON,
    continent: {
      type: DataTypes.STRING, // AF, NA, OC, AS, EU, SA
      validate: {
        isProperValue(value) {
          if (
            value != 'AF' &&
            value != 'NA' &&
            value != 'OC' &&
            value != 'AS' &&
            value != 'EU' &&
            value != 'SA'
          ) {
            throw new Error('Only "AF", "NA", "OC", "AS", "EU", "SA" values are allowed!');
          }
        }
      }
    },
    isDefault: { type: DataTypes.BOOLEAN, unique: true, },
    isFias: { type: DataTypes.BOOLEAN, },
    isShownInSearch: { type: DataTypes.BOOLEAN, },
    isShownInZone: { type: DataTypes.BOOLEAN, },
  });

  const validateHook = async (country, options) => {
    if (country.changed('code')) {
      country.code = country.code.toUpperCase().trim();
    }
  }
  Country.addHook('beforeCreate', validateHook);
  Country.addHook('beforeUpdate', validateHook);

  Country.associate = function(models) {
    models.Country.hasMany(models.Region, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'CASCADE',
      onUpdate: 'RESTRICT',
    });
  };

  return Country;
};
