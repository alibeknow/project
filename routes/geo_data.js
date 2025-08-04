const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { GeoData, Sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('geo_data:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('GeoData', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const { count, rows } = await GeoData.findAndCountAll({
    where: conditions.where.GeoData,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
  });
  res.json(createJSONResult({ data: rows, count }));
}));

module.exports = router;
