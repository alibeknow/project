module.exports = (sequelize, DataTypes) => {
  const OrderService = sequelize.define('OrderService', {
    name: DataTypes.JSON,
    code: DataTypes.STRING,
    quantity: DataTypes.INTEGER,
    companyPrice: DataTypes.FLOAT,
    clientPrice: DataTypes.FLOAT,
    taxVAT: DataTypes.FLOAT,
    action: {
      type: DataTypes.STRING, // no_action, send_sms
      allowNull: false,
      validate: {
        isProperValue(value) {
          if (
            value != 'no_action' &&
            value != 'send_sms' &&
            value != 'notification' &&
            value != 'insurance' &&
            value != 'cash_assigment'
          ) {
            throw new Error('Only "no_action", "send_sms", "notification", "insurance", "cash_assigment" values are allowed!');
          }
        }
      }
    },
  });

  OrderService.associate = function(models) {
    models.OrderService.belongsTo(models.Order);
  };

  return OrderService;
};
