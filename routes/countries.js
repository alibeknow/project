const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { Country, Region, Sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('countries:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('Country', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const count = await Country.count({
    where: conditions.where.Country,
  });

  const rows = await Country.findAll({
    where: conditions.where.Country,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
    include: [
      {
        required: false,
        model: Region,
        where: {
          isShownInZone: true,
        },
      }
    ],
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('countries:get'), asyncHandler(async (req, res, next) => {
  const obj = await Country.findOne({
    where: { id: req.query.id }
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('countries:add'), asyncHandler(async (req, res, next) => {
  const obj = await Country.create(req.body);
  res.json(createJSONResult(obj));
}));

router.post('/edit', authMiddleware, aclMiddleware('countries:edit'), asyncHandler(async (req, res, next) => {
  const obj = await Country.findOne({
    where: { id: req.body.id }
  });
  for (let field in req.body) {
    obj[field] = req.body[field];
  }
  const result = await obj.save();
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('countries:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }
  const obj = await Country.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

module.exports = router;
