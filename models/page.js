module.exports = (sequelize, DataTypes) => {
  const Page = sequelize.define('Page', {
    code: { type: DataTypes.STRING, allowNull: false },
    title: DataTypes.JSON,
    description: DataTypes.JSON,
    content: DataTypes.JSON,
    showInMenu: DataTypes.BOOLEAN,
    menuOrder: DataTypes.INTEGER,
  });

  Page.associate = function(models) {

  };

  return Page;
};
