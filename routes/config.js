const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { ConfigParam, Sequelize, sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/get', authMiddleware, aclMiddleware('config:get'), asyncHandler(async (req, res, next) => {
  const configParams = await ConfigParam.findAll({
    where: {},
  });
  const obj = {};

  configParams.forEach((configParam) => {
    obj[configParam.param] = configParam.value;
  });
  res.json(createJSONResult(obj));
}));

router.post('/set', authMiddleware, aclMiddleware('config:set'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {
    const obj = req.body;

    await ConfigParam.destroy({
      where: {},
    });

    const configParams = Object.keys(obj);
    for (let configParam of configParams) {
      configValue = req.body[configParam];

      await ConfigParam.create({
        param: configParam,
        value: configValue,
      });
    }

    return obj;
  });

  res.json(createJSONResult(result));
}));

module.exports = router;
