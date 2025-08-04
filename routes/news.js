const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { NewsPage, Sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('news:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('NewsPage', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const { count, rows } = await NewsPage.findAndCountAll({
    where: conditions.where.NewsPage,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('news:get'), asyncHandler(async (req, res, next) => {
  const obj = await NewsPage.findOne({
    where: { id: req.query.id }
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('news:add'), asyncHandler(async (req, res, next) => {
  const obj = await NewsPage.create(req.body);
  res.json(createJSONResult(obj));
}));

router.post('/edit', authMiddleware, aclMiddleware('news:edit'), asyncHandler(async (req, res, next) => {
  const obj = await NewsPage.findOne({
    where: { id: req.body.id }
  });
  for (let field in req.body) {
    obj[field] = req.body[field];
  }
  const result = await obj.save();
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('news:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }
  const obj = await NewsPage.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

module.exports = router;
