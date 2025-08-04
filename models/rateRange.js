module.exports = (sequelize, DataTypes) => {
  const RateRange = sequelize.define('RateRange', {
    weightFrom: DataTypes.FLOAT,
    weightTo: DataTypes.FLOAT,
    price: DataTypes.FLOAT,
    step: DataTypes.FLOAT,
    pricePerStep: DataTypes.FLOAT,
    marginMin: DataTypes.FLOAT,
    margin: DataTypes.FLOAT,
    discount: DataTypes.FLOAT,
  });

  RateRange.associate = function(models) {
    models.RateRange.belongsTo(models.Rate);
  };

  return RateRange;
};
