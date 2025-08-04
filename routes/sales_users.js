const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { User, Sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('sales_users:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('User', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });
  
  const { count, rows } = await User.findAndCountAll({
    where: {
      ...conditions.where.User,
      role: 'sales',
    },
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
    attributes: {
      exclude: ['password', 'APIKey'],
    },
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('sales_users:get'), asyncHandler(async (req, res, next) => {
  const obj = await User.findOne({
    where: {
      id: req.query.id,
      role: 'sales',
    },
    attributes: {
      exclude: ['password', 'APIKey'],
    },
  });
  res.json(createJSONResult(obj));
}));

module.exports = router;
