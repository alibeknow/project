const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const bcrypt = require('bcrypt');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');
const acl = require('../acl');

const { AccessLog, User, Company, UserGroup, Group, Sequelize, sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');

const configLib = require('../libs/config');

const config = require('../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);


router.get('/', authMiddleware, aclMiddleware('access_log:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('AccessLog', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const count = await AccessLog.count({
    where: conditions.where.AccessLog,
    include: [
      {
        model: User,
        where: conditions.where.User,
      },
    ]
  });

  const rows = await AccessLog.findAll({
    where: conditions.where.AccessLog,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
    include: [
      {
        model: User,
        where: conditions.where.User,
      },
    ]
  });
  res.json(createJSONResult({ data: rows, count }));
}));

module.exports = router;
