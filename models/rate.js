module.exports = (sequelize, DataTypes) => {
  const Rate = sequelize.define('Rate', {
    name: DataTypes.JSON,
    description: DataTypes.JSON,
  });

  Rate.associate = function(models) {
    models.Rate.hasMany(models.RateRange, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    models.Rate.belongsTo(models.Zone);
    models.Rate.belongsTo(models.PackageType);
    models.Rate.belongsTo(models.RateType);
    models.Rate.belongsTo(models.Group);
  };

  return Rate;
};
