const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const acl = require('../acl');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');

const config = require('../config/app');
const fetch = require('isomorphic-unfetch');


const { Address, Sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');


router.get('/', authMiddleware, aclMiddleware('addresses:list'), asyncHandler(async (req, res, next) => {
  const where = req.query.where ? JSON5.parse(req.query.where) : {};

  if (!req.user || !acl.isAllowed(req.user.role, 'addresses:perms-all')) {
    if (req.user) {
      where.UserId = { eq: req.user.id };
    } else {
      where.UserId = { eq: -1 };
    }
  }

  const conditions = processListQuery('Address', {
    where: JSON.stringify(where),
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const { count, rows } = await Address.findAndCountAll({
    where: conditions.where.Address,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('addresses:get'), asyncHandler(async (req, res, next) => {
  const where = {
    id: req.query.id,
  };

  if (!req.user || !acl.isAllowed(req.user.role, 'addresses:perms-all')) {
    if (req.user) {
      where.UserId = { [Sequelize.Op.eq]: req.user.id };
    } else {
      where.UserId = { [Sequelize.Op.eq]: -1 };
    }
  }

  const obj = await Address.findOne({
    where: where,
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('addresses:add'), asyncHandler(async (req, res, next) => {
  if (!req.body.UserId) req.body.UserId = req.user.id;

  const obj = await Address.create(req.body);

  const dupAddr = await Address.findOne({
    where: {
      id: { [Sequelize.Op.ne]: obj.id },
      UserId: req.body.UserId,
      address: obj.address,
    },
  });

  if (dupAddr) {
    await obj.destroy();

    res.json(createJSONResult(dupAddr));
  } else {
    res.json(createJSONResult(obj));
  }

}));

router.post('/edit', authMiddleware, aclMiddleware('addresses:edit'), asyncHandler(async (req, res, next) => {
  const where = {
    id: req.body.id,
  };

  if (!req.user || !acl.isAllowed(req.user.role, 'addresses:perms-all')) {
    where.UserId = { [Sequelize.Op.eq]: req.user.id };
  }

  const obj = await Address.findOne({
    where: where
  });
  for (let field in req.body) {
    obj[field] = req.body[field];
  }
  const result = await obj.save();
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('addresses:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = {
      id: { [Sequelize.Op.in]: id },
    };
    if (!req.user || !acl.isAllowed(req.user.role, 'addresses:perms-all')) where['UserId'] = req.user.id;
  } else {
    var where = {
      id,
    };
    if (!req.user || !acl.isAllowed(req.user.role, 'addresses:perms-all')) where['UserId'] = req.user.id;
  }

  const obj = await Address.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

router.get('/suggest', authMiddleware, aclMiddleware('addresses:suggest'), asyncHandler(async (req, res, next) => {
  let addresses = [];

  const uri = `https://geocode-maps.yandex.ru/1.x/?apikey=${ config.yaToken }&geocode=${ req.query.query }&format=json&results=20&lang=ru_RU`;
  const ret = await fetch(uri);
  
  if (ret.status && ret.status == 200) {
    const geo = await ret.json();

    if (geo.response.GeoObjectCollection.featureMember && Array.isArray(geo.response.GeoObjectCollection.featureMember)) {
      addresses = geo.response.GeoObjectCollection.featureMember
        .filter((obj) => ['street', 'house'].includes(obj.GeoObject.metaDataProperty.GeocoderMetaData.kind))
        .map((obj) => ({
          name: obj.GeoObject.name,  
          description: obj.GeoObject.description,  
        }));
    }
  }
  res.json(createJSONResult({
    data: addresses,
    count: addresses.length,
  }));
}));

module.exports = router;
