const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { RateType, Sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('rate_types:list'), asyncHandler(async (req, res, next) => {
  const { count, rows } = await RateType.findAndCountAll({
    order: [['id', 'asc']],
  });
  res.json(createJSONResult({ data: rows, count }));
}));

module.exports = router;
