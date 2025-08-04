module.exports = (sequelize, DataTypes) => {
  const RateType = sequelize.define('RateType', {
    type: { type: DataTypes.STRING, unique: true, },
  });

  RateType.associate = function(models) {
    models.RateType.hasMany(models.Rate, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    });
    models.RateType.hasMany(models.RateParam, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    });
  };

  return RateType;
};
