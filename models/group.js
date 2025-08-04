module.exports = (sequelize, DataTypes) => {
  const Group = sequelize.define('Group', {
    name: DataTypes.JSON,
    isDefault: { type: DataTypes.BOOLEAN, unique: true, },
    isContractPayment: { type: DataTypes.BOOLEAN, initialValue: false, },
    discount: DataTypes.FLOAT,
  });

  Group.associate = function(models) {
    models.Group.belongsToMany(models.User, {
      as: 'Groups',
      through: models.UserGroup,
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    models.Group.hasMany(models.GroupDiscount);
  };

  return Group;
};
