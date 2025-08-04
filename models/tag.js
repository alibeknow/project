module.exports = (sequelize, DataTypes) => {
  const Tag = sequelize.define('Tag', {
    name: DataTypes.JSON,
  });

  Tag.associate = function(models) {
    models.Tag.belongsToMany(models.Order, {
      as: 'Tags',
      through: models.OrderTag,
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  };

  return Tag;
};
