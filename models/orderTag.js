module.exports = (sequelize, DataTypes) => {
  const OrderTag = sequelize.define('OrderTag', {

  }, { timestamps: false });

  OrderTag.associate = function(models) {
    models.OrderTag.belongsTo(models.Order);
    models.OrderTag.belongsTo(models.Tag);
  };

  return OrderTag;
};
