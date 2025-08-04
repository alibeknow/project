module.exports = (sequelize, DataTypes) => {
  const GeoData = sequelize.define('GeoData', {
    countryCode: DataTypes.STRING,
    province: DataTypes.STRING,
    district: DataTypes.STRING,
    city: DataTypes.STRING,
    postCode: DataTypes.STRING,
    langCode: DataTypes.STRING,
  });

  GeoData.associate = function(models) {

  };

  return GeoData;
};
