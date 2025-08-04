const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');

const { Company, Sequelize, sequelize } = require('../models');

const config = require('../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);


router.get('/', authMiddleware, aclMiddleware('dashboard:list'), asyncHandler(async (req, res, next) => {
  res.json(createJSONResult(true));
}));

router.get('/month_orders_count', authMiddleware, aclMiddleware('dashboard:month_orders_count'), asyncHandler(async (req, res, next) => {
  let whereCompany = '';
  let joinUsers = '';
  let subQueries = [];

  let primaryCompanyId = null;
  const primaryCompany = await Company.findOne({
    where: { isPrimary: true },
  });
  if (!primaryCompany) throw Error('Primary Company is not defined.');
  primaryCompanyId = primaryCompany.id;

  let userCompanyId = req.user.CompanyId;
  if (userCompanyId != primaryCompanyId) {
    joinUsers    = ' INNER JOIN "Users" ON "Orders"."UserId" = "Users"."id" ';
    whereCompany = ' AND "CompanyId" = ' + userCompanyId;
  }

  const startOfToday = moment().startOf('day');

  let currentDay = startOfToday;
  let nextDay;
  let i = 0;
  while (i > -31) {
    currentDay = moment(startOfToday).add(i, 'day');
    nextDay    = moment(startOfToday).add(i + 1, 'day');

    subQueries.push(`(SELECT count(1) AS "${moment(currentDay).format('YYYY-MM-DD')}" FROM "Orders" ${joinUsers} WHERE "Orders"."createdAt" BETWEEN '${moment(currentDay).tz('Etc/UTC').format('YYYY-MM-DD HH:mm:ss')}'::timestamp AND '${moment(nextDay).tz('Etc/UTC').format('YYYY-MM-DD HH:mm:ss')}'::timestamp ${whereCompany})`);
    i--;
  }

  let rawQuery = 'SELECT ' + subQueries.join(',');
  let counts = await sequelize.query(rawQuery, { type: Sequelize.QueryTypes.SELECT });
  counts = counts.pop();

  const data = [];
  for (let key in counts) {
    let val = counts[key];
    data.push({ date: key, count: +val });
  }

  res.json(createJSONResult(data.reverse()));
}));

router.get('/orders_status_count', authMiddleware, aclMiddleware('dashboard:orders_status_count'), asyncHandler(async (req, res, next) => {
  let whereCompany = '';
  let joinUsers = '';
  let subQueries = [];

  let primaryCompanyId = null;
  const primaryCompany = await Company.findOne({
    where: { isPrimary: true },
  });
  if (!primaryCompany) throw Error('Primary Company is not defined.');
  primaryCompanyId = primaryCompany.id;

  let userCompanyId = req.user.CompanyId;
  if (userCompanyId != primaryCompanyId) {
    joinUsers    = ' INNER JOIN "Users" ON "Orders"."UserId" = "Users"."id" ';
    whereCompany = ' AND "CompanyId" = ' + userCompanyId;
  }

  const statuses = ["pending", "processing", "attention", "confirmed", "declined", "returned", "destroyed", "lost", "canceled", "in_transit", "idle_run", "delivered"];

  statuses.forEach((status) => {
    subQueries.push(`(SELECT count(1) AS "${status}" FROM "Orders" ${joinUsers} WHERE "Orders"."orderStatus" = '${status}' ${whereCompany})`);
  });

  let rawQuery = 'SELECT ' + subQueries.join(',');
  let counts = await sequelize.query(rawQuery, { type: Sequelize.QueryTypes.SELECT });
  counts = counts.pop();

  const data = [];
  for (let key in counts) {
    let val = counts[key];
    data.push({ status: key, count: +val });
  }

  res.json(createJSONResult(data));
}));

module.exports = router;
