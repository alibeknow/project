const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');
const _round = require('lodash/round');


const { Rate, RateRange, PackageType, RateType, RateParam, Carrier, Zone, Country, Region, RegionRule, AdditionalService, Group, GroupDiscount, Sequelize, sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');

const ratesLib = require('../libs/rates');
const configLib = require('../libs/config');


router.get('/', authMiddleware, aclMiddleware('rates:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('Rate', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const count = await Rate.count({
    where: conditions.where.Rate,
  });

  const rows = await Rate.findAll({
    where: conditions.where.Rate,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
    include: [
      RateRange,
      PackageType,
      RateType,
      Group,
    ],
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('rates:get'), asyncHandler(async (req, res, next) => {
  const obj = await Rate.findOne({
    where: { id: req.query.id },
    order: [[ RateRange, 'weightFrom', 'ASC' ]],
    include: [
      RateRange,
      PackageType,
      RateType,
      Group,
    ],
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('rates:add'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {
    const obj = await Rate.create(req.body);

    await RateRange.destroy({
      where: { RateId: obj.id }
    });

    const ratesArr = req.body.rates || [];
    for (let rate of ratesArr) {
      rate.RateId = obj.id;
      await RateRange.create(rate);
    }

    return obj;
  });
  res.json(createJSONResult(result));
}));

router.post('/edit', authMiddleware, aclMiddleware('rates:edit'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {
    const obj = await Rate.findOne({
      where: { id: req.body.id }
    });
    for (let field in req.body) {
      obj[field] = req.body[field];
    }
    const _result = await obj.save();

    await RateRange.destroy({
      where: { RateId: obj.id }
    });

    const ratesArr = req.body.rates || [];
    for (let rate of ratesArr) {
      rate.RateId = obj.id;
      await RateRange.create(rate);
    }

    return _result;
  });
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('rates:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }
  const obj = await Rate.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

router.post('/search', authMiddleware, aclMiddleware('rates:search'), asyncHandler(async (req, res, next) => {
  let {
    rateId,
    fromCountryId = '',
    toCountryId = '',
    fromCountryISO = '',
    toCountryISO = '',
    fromPostCode = '',
    toPostCode = '',
    fromFiasGUID = '',
    toFiasGUID = '',
    fromCity = '',
    toCity = '',
    fromAddress = '',
    toAddress = '',
    packageTypeId = '',
    packageType = '',
    packages = [],
    declaredValue = 0,
    limit = 100,
    offset = 0,
  } = req.body;

  const results = await ratesLib.ratesSearch({
    rateId,
    fromCountryId,
    toCountryId,
    fromCountryISO,
    toCountryISO,
    fromPostCode,
    toPostCode,
    fromFiasGUID,
    toFiasGUID,
    fromCity,
    toCity,
    fromAddress,
    toAddress,
    packageTypeId,
    packageType,
    packages,
    declaredValue,
    limit,
    offset,
    user: req.user,
  });

  res.json(createJSONResult(results));
}));

router.post('/clone', authMiddleware, aclMiddleware('rates:clone'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {
    let obj = await Rate.findOne({
      where: { id: req.body.id }
    });

    obj = obj.toJSON();
    delete obj.id;
    
    const date = new Date().toISOString();

    obj.name = {
      _ok: true,
      en: obj.name.en ? obj.name.en + ` (Clone ${date})` : `(Clone ${date})`,
      ru: obj.name.ru ? obj.name.ru + ` (Clone ${date})` : `(Clone ${date})`,
    };

    const rateRangesArrObj = await RateRange.findAll({
      where: { RateId: req.body.id }
    });

    let newRate = await Rate.create(obj);

    for (let rateRange of rateRangesArrObj) {
      rateRange = rateRange.toJSON();
      delete rateRange.id;
      rateRange.RateId = newRate.id;
      await RateRange.create(rateRange);
    }

    return true;
  });
  res.json(createJSONResult(result));
}));

module.exports = router;
