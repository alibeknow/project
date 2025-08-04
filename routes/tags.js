const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { Tag, Sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('tags:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('Tag', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const { count, rows } = await Tag.findAndCountAll({
    where: conditions.where.NewsPage,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('tags:get'), asyncHandler(async (req, res, next) => {
  const obj = await Tag.findOne({
    where: { id: req.query.id }
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('tags:add'), asyncHandler(async (req, res, next) => {
  const obj = await Tag.create(req.body);
  res.json(createJSONResult(obj));
}));

router.post('/edit', authMiddleware, aclMiddleware('tags:edit'), asyncHandler(async (req, res, next) => {
  const obj = await Tag.findOne({
    where: { id: req.body.id }
  });
  for (let field in req.body) {
    obj[field] = req.body[field];
  }
  const result = await obj.save();
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('tags:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }
  const obj = await Tag.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

module.exports = router;
