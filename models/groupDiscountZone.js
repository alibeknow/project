module.exports = (sequelize, DataTypes) => {
  const GroupDiscountZone = sequelize.define('GroupDiscountZone', {

  }, { timestamps: false });

  GroupDiscountZone.associate = function(models) {
    models.GroupDiscountZone.belongsTo(models.GroupDiscount);
    models.GroupDiscountZone.belongsTo(models.Zone);
  };

  return GroupDiscountZone;
};
