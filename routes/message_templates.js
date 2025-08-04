const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { MessageTemplate, Sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('message_templates:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('MessageTemplate', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const { count, rows } = await MessageTemplate.findAndCountAll({
    where: conditions.where.MessageTemplate,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('message_templates:get'), asyncHandler(async (req, res, next) => {
  const obj = await MessageTemplate.findOne({
    where: { id: req.query.id }
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('message_templates:add'), asyncHandler(async (req, res, next) => {
  const obj = await MessageTemplate.create(req.body);
  res.json(createJSONResult(obj));
}));

router.post('/edit', authMiddleware, aclMiddleware('message_templates:edit'), asyncHandler(async (req, res, next) => {
  const obj = await MessageTemplate.findOne({
    where: { id: req.body.id }
  });
  for (let field in req.body) {
    obj[field] = req.body[field];
  }
  const result = await obj.save();
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('message_templates:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }
  const obj = await MessageTemplate.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

module.exports = router;
