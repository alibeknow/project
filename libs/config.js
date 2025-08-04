const { ConfigParam, Sequelize, sequelize } = require('../models');

const get = async () => {
  const configParams = await ConfigParam.findAll({
    where: {},
  });
  const obj = {};

  configParams.forEach((configParam) => {
    obj[configParam.param] = configParam.value;
  });
  return obj;
};

module.exports.get = get;
