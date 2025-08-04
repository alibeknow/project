module.exports = (sequelize, DataTypes) => {
  const AdditionalService = sequelize.define('AdditionalService', {
    name: DataTypes.JSON,
    description: DataTypes.JSON,
    code: DataTypes.STRING,
    isPublic: { type: DataTypes.BOOLEAN, defaultValue: true },
    isMulti: { type: DataTypes.BOOLEAN, defaultValue: false },
    hasVAT: { type: DataTypes.BOOLEAN, defaultValue: true },
    companyValue: DataTypes.FLOAT,
    clientValue: DataTypes.FLOAT,
    calcType: {
      type: DataTypes.STRING, // fixed_price, declared_value_in, declared_value_ex,
      allowNull: false,
      validate: {
        isProperValue(value) {
          if (
            value != 'fixed_price' &&
            value != 'declared_value_in' &&
            value != 'declared_value_ex'
          ) {
            throw new Error('Only "fixed_price", "declared_value_in", "declared_value_ex" values are allowed!');
          }
        }
      }
    },
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

  AdditionalService.associate = function(models) {
    models.AdditionalService.belongsTo(models.Carrier);
    models.AdditionalService.belongsTo(models.Group);
  };

  return AdditionalService;
};
