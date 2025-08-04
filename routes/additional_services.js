const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { AdditionalService, Sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('additional_services:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('AdditionalService', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const { count, rows } = await AdditionalService.findAndCountAll({
    where: conditions.where.AdditionalService,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('additional_services:get'), asyncHandler(async (req, res, next) => {
  const obj = await AdditionalService.findOne({
    where: { id: req.query.id }
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('additional_services:add'), asyncHandler(async (req, res, next) => {
  const obj = await AdditionalService.create(req.body);
  res.json(createJSONResult(obj));
}));

router.post('/edit', authMiddleware, aclMiddleware('additional_services:edit'), asyncHandler(async (req, res, next) => {
  const obj = await AdditionalService.findOne({
    where: { id: req.body.id }
  });
  for (let field in req.body) {
    obj[field] = req.body[field];
  }
  const result = await obj.save();
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('additional_services:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }
  const obj = await AdditionalService.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

module.exports = router;
