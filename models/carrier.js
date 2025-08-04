module.exports = (sequelize, DataTypes) => {
  const Carrier = sequelize.define('Carrier', {
    name: DataTypes.JSON,
    logo: DataTypes.TEXT,
    fuelTax: DataTypes.FLOAT,
    insuranceIncluded: DataTypes.FLOAT,
    insurancePercentage: DataTypes.FLOAT,
    isActive: DataTypes.BOOLEAN,
    trackingURL: DataTypes.STRING,
    isRateByCarrierApi: DataTypes.BOOLEAN,
    isVATIncluded: DataTypes.BOOLEAN,
    isFuelTaxIncluded: DataTypes.BOOLEAN,
    api: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'none',
      validate: {
        isProperValue(value) {
          if (
            value != 'measoft' &&
            value != 'alemtat' &&
            value != 'cse' &&
            value != 'cse_msk_mo' &&
            value != 'cse_im' &&
            value != 'cse_cargo' &&
            value != 'cse_business' &&
            value != 'gps' &&
            value != 'aramex' &&
            value != 'ponyexpress' &&
            value != 'ase' &&
            value != 'spark' &&
            value != 'ems' &&
            value != 'dpd' &&
            value != 'yandex' &&
            value != 'sdek' &&
            value != 'tatex' &&
            value != 'smartdelivery' &&
            value != 'dreamdelivery' &&
            value != 'rocketdelivery' &&
            value != 'none'
          ) {
            throw new Error('Only "none", "measoft", "alemtat", "cse", "cse_msk_mo", "cse_im", "cse_cargo", "cse_business", "gps", "aramex", "ponyexpress", "ase", "spark", "ems", "dpd", "yandex", "sdek", "tatex", "smartdelivery", dreamdelivery, rocketdelivery values are allowed!');
          }
        }
      }
    },
  });

  Carrier.associate = function(models) {
    models.Carrier.hasMany(models.Zone, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    models.Carrier.hasMany(models.RateParam, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  };

  return Carrier;
};
