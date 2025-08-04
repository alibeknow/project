module.exports = (sequelize, DataTypes) => {
  const NewsPage = sequelize.define('NewsPage', {
    title: DataTypes.JSON,
    description: DataTypes.JSON,
    image: DataTypes.TEXT,
    content: DataTypes.JSON,
  });

  NewsPage.associate = function(models) {

  };

  return NewsPage;
};
