const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { Region, RegionRule, Sequelize, sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('regions:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('Region', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const count = await Region.count({
    where: conditions.where.Region,
  });

  const rows = await Region.findAll({
    where: conditions.where.Region,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
    include: [
      { model: RegionRule },
    ],
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('regions:get'), asyncHandler(async (req, res, next) => {
  const obj = await Region.findOne({
    where: { id: req.query.id },
    include: [
      { model: RegionRule },
    ],
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('regions:add'), asyncHandler(async (req, res, next) => {
  const obj = await Region.create(req.body, {
    include: [
      { model: RegionRule },
    ],
  });
  res.json(createJSONResult(obj));
}));

router.post('/edit', authMiddleware, aclMiddleware('regions:edit'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {
    const obj = await Region.findOne({
      where: { id: req.body.id },
    });
    for (let field in req.body) {
      obj[field] = req.body[field];
    }
    const _result = await obj.save();

    await RegionRule.destroy({
      where: { RegionId: obj.id }
    });

    const regionRules = req.body.RegionRules || [];
    for (let rule of regionRules) {
      rule.RegionId = obj.id;
      await RegionRule.create(rule);
    }

    return _result;
  });
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('regions:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }
  const obj = await Region.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

module.exports = router;
