module.exports = (sequelize, DataTypes) => {
  const OrderHistory = sequelize.define('OrderHistory', {
    action: DataTypes.STRING,
    orderData: DataTypes.JSON,
    OrderId: DataTypes.INTEGER,
  });

  return OrderHistory;
};
