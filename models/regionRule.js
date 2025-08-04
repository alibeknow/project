module.exports = (sequelize, DataTypes) => {
  const RegionRule = sequelize.define('RegionRule', {
    rule: DataTypes.STRING,
  });

  RegionRule.associate = function(models) {
    models.RegionRule.belongsTo(models.Region);
  };

  const validateHook = async (regionRule, options) => {
    if (regionRule.changed('rule')) {
      regionRule.rule = regionRule.rule.toUpperCase().trim();
    }
  }
  RegionRule.addHook('beforeCreate', validateHook);
  RegionRule.addHook('beforeUpdate', validateHook);

  return RegionRule;
};
