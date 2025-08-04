module.exports = (sequelize, DataTypes) => {
  const PaymentNotification = sequelize.define('PaymentNotification', {
    type: DataTypes.STRING,
    paymentData: DataTypes.JSON,
    OrderId: DataTypes.INTEGER,
  });

  return PaymentNotification;
};
