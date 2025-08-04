const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');

const { GroupDiscount, GroupDiscountZone, Group, Zone, Carrier, Sequelize, sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('group_discounts:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('GroupDiscount', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const { count, rows } = await GroupDiscount.findAndCountAll({
    where: conditions.where.GroupDiscount,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
    include: [
      {
        model: Carrier,
        where: conditions.where.Carrier,
      },
    ],
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('group_discounts:get'), asyncHandler(async (req, res, next) => {
  const obj = await GroupDiscount.findOne({
    where: { id: req.query.id },
    include: [
      {
        model: Carrier,
      },
      {
        model: Zone,
        as: 'Zones',
      },
    ],
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('group_discounts:add'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {
    const obj = await GroupDiscount.create(req.body);

    await GroupDiscountZone.destroy({
      where: { GroupDiscountId: obj.id }
    });

    const zonesArr = req.body.zones || [];
    for (let zoneId of zonesArr) {
      let zone = {
        GroupDiscountId: obj.id,
        ZoneId: zoneId,
      };
      await GroupDiscountZone.create(zone);
    }

    return obj;
  });
  res.json(createJSONResult(result));
}));

router.post('/edit', authMiddleware, aclMiddleware('group_discounts:edit'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {
    const obj = await GroupDiscount.findOne({
      where: { id: req.body.id }
    });
    for (let field in req.body) {
      obj[field] = req.body[field];
    }
    const _result = await obj.save();

    await GroupDiscountZone.destroy({
      where: { GroupDiscountId: obj.id }
    });

    const zonesArr = req.body.zones || [];
    for (let zoneId of zonesArr) {
      let zone = {
        GroupDiscountId: obj.id,
        ZoneId: zoneId,
      };
      await GroupDiscountZone.create(zone);
    }

    return _result;
  });
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('group_discounts:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }
  const obj = await GroupDiscount.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

module.exports = router;
