const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');


const { Zone, ZoneRegionFrom, ZoneRegionTo, AdditionalService, ZoneAdditionalService, Region, Country, Rate, RateRange, Sequelize, sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('zones:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('Zone', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const count = await Zone.count({
    where: conditions.where.Zone,
  });

  const rows = await Zone.findAll({
    where: conditions.where.Zone,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
    include: [
      {
        model: Region,
        as: 'RegionsFrom',
        include: [ Country ],
        where: conditions.where.RegionsFrom,
      },
      {
        model: Region,
        as: 'RegionsTo',
        include: [ Country ],
        where: conditions.where.RegionsTo,
      },
      {
        model: AdditionalService,
        as: 'AdditionalServices',
      },
    ],
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('zones:get'), asyncHandler(async (req, res, next) => {
  const obj = await Zone.findOne({
    where: { id: req.query.id },
    include: [
      {
        model: Region,
        as: 'RegionsFrom',
        include: [ Country ],
      },
      {
        model: Region,
        as: 'RegionsTo',
        include: [ Country ],
      },
      {
        model: AdditionalService,
        as: 'AdditionalServices',
      },
    ],
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('zones:add'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {
    const obj = await Zone.create(req.body);

    await ZoneRegionFrom.destroy({
      where: { ZoneId: obj.id }
    });
    await ZoneRegionTo.destroy({
      where: { ZoneId: obj.id }
    });

    const fromArr = req.body.from || [];
    for (let regionId of fromArr) {
      await ZoneRegionFrom.create({
        ZoneId: obj.id,
        RegionId: regionId,
      });
    }

    const toArr = req.body.to || [];
    for (let regionId of toArr) {
      await ZoneRegionTo.create({
        ZoneId: obj.id,
        RegionId: regionId,
      });
    }

    await ZoneAdditionalService.destroy({
      where: { ZoneId: obj.id }
    });

    const additionalServicesArr = req.body.additionalServices || [];
    for (let additionalServiceId of additionalServicesArr) {
      await ZoneAdditionalService.create({
        ZoneId: obj.id,
        AdditionalServiceId: additionalServiceId,
      });
    }

    return obj;
  });
  res.json(createJSONResult(result));
}));

router.post('/edit', authMiddleware, aclMiddleware('zones:edit'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {
    const obj = await Zone.findOne({
      where: { id: req.body.id }
    });
    for (let field in req.body) {
      obj[field] = req.body[field];
    }
    const _result = await obj.save();

    await ZoneRegionFrom.destroy({
      where: { ZoneId: obj.id }
    });
    await ZoneRegionTo.destroy({
      where: { ZoneId: obj.id }
    });

    const fromArr = req.body.from || [];
    for (let regionId of fromArr) {
      await ZoneRegionFrom.create({
        ZoneId: obj.id,
        RegionId: regionId,
      });
    }

    const toArr = req.body.to || [];
    for (let regionId of toArr) {
      await ZoneRegionTo.create({
        ZoneId: obj.id,
        RegionId: regionId,
      });
    }

    await ZoneAdditionalService.destroy({
      where: { ZoneId: obj.id }
    });

    const additionalServicesArr = req.body.additionalServices || [];
    for (let additionalServiceId of additionalServicesArr) {
      await ZoneAdditionalService.create({
        ZoneId: obj.id,
        AdditionalServiceId: additionalServiceId,
      });
    }

    return _result;
  });
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('zones:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }
  const obj = await Zone.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

router.post('/clone', authMiddleware, aclMiddleware('zones:clone'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {
    let obj = await Zone.findOne({
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

    const zone = await Zone.create(obj);

    const fromArrObj = await ZoneRegionFrom.findAll({
      where: { ZoneId: req.body.id }
    });
    const toArrObj = await ZoneRegionTo.findAll({
      where: { ZoneId: req.body.id }
    });

    for (let region of fromArrObj) {
      region = region.toJSON();
      delete region.id;
      region.ZoneId = zone.id;
      await ZoneRegionFrom.create(region);
    }

    for (let region of toArrObj) {
      region = region.toJSON();
      delete region.id;
      region.ZoneId = zone.id;
      await ZoneRegionTo.create(region);
    }

    const additionalServicesArrObj = await ZoneAdditionalService.findAll({
      where: { ZoneId: req.body.id }
    });

    for (let additionalService of additionalServicesArrObj) {
      additionalService = additionalService.toJSON();
      delete additionalService.id;
      additionalService.ZoneId = zone.id;
      await ZoneAdditionalService.create(additionalService);
    }

    const rateArrObj = await Rate.findAll({
      where: { ZoneId: req.body.id }
    });

    for (let rate of rateArrObj) {
      const rateRangesArrObj = await RateRange.findAll({
        where: { RateId: rate.id }
      });

      rate = rate.toJSON();
      delete rate.id;
      rate.ZoneId = zone.id;
      let newRate = await Rate.create(rate);

      for (let rateRange of rateRangesArrObj) {
        rateRange = rateRange.toJSON();
        delete rateRange.id;
        rateRange.RateId = newRate.id;
        await RateRange.create(rateRange);
      }
    }

    return true;
  });
  res.json(createJSONResult(result));
}));

module.exports = router;
