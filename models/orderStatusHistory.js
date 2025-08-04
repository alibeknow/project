module.exports = (sequelize, DataTypes) => {
  const OrderStatusHistory = sequelize.define('OrderStatusHistory', {
    orderStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isProperValue(value) {
          if (
            value != 'pending' &&
            value != 'processing' &&
            value != 'attention' &&
            value != 'confirmed' &&
            value != 'declined' &&
            value != 'returned' &&
            value != 'destroyed' &&
            value != 'lost' &&
            value != 'canceled' &&
            value != 'in_transit' &&
            value != 'idle_run' &&
            value != 'delivered'
          ) {
            throw new Error('Only "pending", "processing", "attention", "confirmed", "declined", "returned", "destroyed", "lost", "canceled", "in_transit", "idle_run", "delivered" values are allowed!');
          }
        }
      }
    },
    orderStatusMeta: DataTypes.JSON,
    orderStatusDescription: DataTypes.STRING,
  });

  OrderStatusHistory.associate = function(models) {
    models.OrderStatusHistory.belongsTo(models.Order);
  };

  return OrderStatusHistory;
};
