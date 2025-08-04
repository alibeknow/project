module.exports = (sequelize, DataTypes) => {
  const GroupDiscount = sequelize.define('GroupDiscount', {
    discount: DataTypes.FLOAT,
  });

  GroupDiscount.associate = function(models) {
    models.GroupDiscount.belongsTo(models.Group, {
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    models.GroupDiscount.belongsTo(models.Carrier, {
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    models.GroupDiscount.belongsToMany(models.Zone, {
      as: 'Zones',
      through: models.GroupDiscountZone,
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  };

  return GroupDiscount;
};
