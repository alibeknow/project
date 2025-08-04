module.exports = (sequelize, DataTypes) => {
  const Company = sequelize.define('Company', {
    name: DataTypes.JSON,
    isPrimary: { type: DataTypes.BOOLEAN, unique: true, },
  });

  Company.associate = function(models) {
    models.Company.hasMany(models.User, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    });

    models.Company.hasMany(models.SalesClient, {
      as: 'SalesUsers',
      foreignKey : 'OrderCompanyId',
    });
  };

  return Company;
};
