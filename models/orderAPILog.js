module.exports = (sequelize, DataTypes) => {
  const OrderAPILog = sequelize.define('OrderAPILog', {
    type: DataTypes.STRING,
    data: DataTypes.JSON,
    OrderId: DataTypes.INTEGER,
  });

  return OrderAPILog;
};
