const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { RateParam, PackageType, RateType, Sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('rate_params:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('RateParam', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const { count, rows } = await RateParam.findAndCountAll({
    where: conditions.where.RateParam,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
    include: [
      PackageType,
      RateType,
    ],
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('rate_params:get'), asyncHandler(async (req, res, next) => {
  const obj = await RateParam.findOne({
    where: { id: req.query.id }
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('rate_params:add'), asyncHandler(async (req, res, next) => {
  const obj = await RateParam.create(req.body);
  res.json(createJSONResult(obj));
}));

router.post('/edit', authMiddleware, aclMiddleware('rate_params:edit'), asyncHandler(async (req, res, next) => {
  const obj = await RateParam.findOne({
    where: { id: req.body.id }
  });
  for (let field in req.body) {
    obj[field] = req.body[field];
  }
  const result = await obj.save();
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('rate_params:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }
  const obj = await RateParam.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

module.exports = router;
