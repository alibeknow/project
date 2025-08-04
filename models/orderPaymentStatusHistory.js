module.exports = (sequelize, DataTypes) => {
  const OrderPaymentStatusHistory = sequelize.define('OrderPaymentStatusHistory', {
    paymentStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isProperValue(value) {
          if (
            value != 'pending' &&
            value != 'authorized' &&
            value != 'confirmed' &&
            value != 'failed' &&
            value != 'refunded' &&
            value != 'canceled' &&
            value != 'contract'
          ) {
            throw new Error('Only "pending", "authorized", "confirmed", "failed", "refunded", "canceled", "contract" values are allowed!');
          }
        }
      }
    },
    paymentStatusMeta: DataTypes.JSON,
    paymentStatusDescription: DataTypes.STRING,
  });

  OrderPaymentStatusHistory.associate = function(models) {
    models.OrderPaymentStatusHistory.belongsTo(models.Order);
  };

  return OrderPaymentStatusHistory;
};
