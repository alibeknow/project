module.exports = (sequelize, DataTypes) => {
  const SalesClient = sequelize.define('SalesClient', {
    expiryDate: DataTypes.DATE,
    percent: DataTypes.FLOAT,
    isCompany: DataTypes.BOOLEAN,
  });

  SalesClient.associate = function(models) {
    models.SalesClient.belongsTo(models.User, {
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    models.SalesClient.belongsTo(models.User, {
      as: 'OrderUser',
    });
    models.SalesClient.belongsTo(models.Company, {
      as: 'OrderCompany',
    });
  };

  return SalesClient;
};
