module.exports = (sequelize, DataTypes) => {
  const UserGroup = sequelize.define('UserGroup', {

  }, { timestamps: false });

  UserGroup.associate = function(models) {
    models.UserGroup.belongsTo(models.User);
    models.UserGroup.belongsTo(models.Group);
  };

  return UserGroup;
};
