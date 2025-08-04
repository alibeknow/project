const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { SalesClient, User, Company, sequelize, Sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('sales_clients:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('SalesClient', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const { count, rows } = await SalesClient.findAndCountAll({
    where: conditions.where.SalesClient,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
    include: [
      {
        as: 'OrderUser',
        model: User,
        where: conditions.where.OrderUser,
        attributes: {
          exclude: ['password', 'APIKey'],
        },
      },
      {
        as: 'OrderCompany',
        model: Company,
        where: conditions.where.OrderCompany,
      },
    ],
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('sales_clients:get'), asyncHandler(async (req, res, next) => {
  const obj = await SalesClient.findOne({
    where: req.query.id ? { id: req.query.id } : { code: req.query.code },
    include: [
      {
        as: 'OrderUser',
        model: User,
        attributes: {
          exclude: ['password', 'APIKey'],
        },
      },
      {
        as: 'OrderCompany',
        model: Company,
      },
    ],
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('sales_clients:add'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {
    if (req.body.isCompany) {
      const found = await SalesClient.findOne({
        where: { OrderCompanyId: req.body.OrderCompanyId },
      });
      if (found) throw Error('Client has been already bound to seller with id=' + found.UserId);
    } else {
      const found = await SalesClient.findOne({
        where: { OrderUserId: req.body.OrderUserId },
      });
      if (found) throw Error('Client has been already bound to seller with id=' + found.UserId);
    }
    
    const obj = await SalesClient.create(req.body);
    return obj;
  });
  res.json(createJSONResult(result));
}));

router.post('/edit', authMiddleware, aclMiddleware('sales_clients:edit'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {
    if (req.body.isCompany) {
      const found = await SalesClient.findOne({
        where: { OrderCompanyId: req.body.OrderCompanyId },
      });
      if (found) throw Error('Client has been already bound to seller with id=' + found.UserId);
    } else {
      const found = await SalesClient.findOne({
        where: { OrderUserId: req.body.OrderUserId },
      });
      if (found) throw Error('Client has been already bound to seller with id=' + found.UserId);
    }
    
    const obj = await SalesClient.findOne({
      where: { id: req.body.id }
    });
    for (let field in req.body) {
      obj[field] = req.body[field];
    }
    const result = await obj.save();

    return result;
  });
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('sales_clients:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }
  const obj = await SalesClient.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

module.exports = router;
