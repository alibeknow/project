const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');

const { Group, GroupDiscount, Zone, Sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('groups:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('Group', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const count = await Group.count({
    where: conditions.where.Group,
  });

  const rows = await Group.findAll({
    where: conditions.where.Group,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
    include: [
      {
        model: GroupDiscount,
        include: [
          {
            model: Zone,
            as: 'Zones',
          }
        ],
      },
    ],
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('groups:get'), asyncHandler(async (req, res, next) => {
  const obj = await Group.findOne({
    where: { id: req.query.id },
    include: [
      {
        model: GroupDiscount,
        include: [
          {
            model: Zone,
            as: 'Zones',
          }
        ],
      },
    ],
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('groups:add'), asyncHandler(async (req, res, next) => {
  const obj = await Group.create(req.body);
  res.json(createJSONResult(obj));
}));

router.post('/edit', authMiddleware, aclMiddleware('groups:edit'), asyncHandler(async (req, res, next) => {
  const obj = await Group.findOne({
    where: { id: req.body.id }
  });
  for (let field in req.body) {
    obj[field] = req.body[field];
  }
  const result = await obj.save();
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('groups:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }
  const obj = await Group.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

module.exports = router;
