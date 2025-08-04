const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { PackageType, Sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('package_types:list'), asyncHandler(async (req, res, next) => {
  const { count, rows } = await PackageType.findAndCountAll({
    order: [['id', 'asc']],
  });
  res.json(createJSONResult({ data: rows, count }));
}));

module.exports = router;
