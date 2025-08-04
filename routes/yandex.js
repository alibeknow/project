const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');
  
const { Package, Tag, OrderTag, Order, OrderStatusHistory, OrderPaymentStatusHistory, OrderService, OrderHistory, OrderAPILog, Rate, RateRange, PackageType, RateType, RateParam, Carrier, Zone, Country, Region, RegionRule, AdditionalService, User, Group, GroupDiscount, Company, Sequelize, sequelize } = require('../models');

const YandexAPI = require('../libs/api/yandex');
const config = require('../config/app');
const ratesLib = require('../libs/rates');
const configLib = require('../libs/config');
const acl = require('../acl');
const md5 = require('md5');

const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

function sleep(ms) {  return new Promise(resolve => setTimeout(resolve, ms));}


router.post('/estimate', authMiddleware, aclMiddleware('yandex:estimate'), asyncHandler(async (req, res, next) => {
  const configParams = await configLib.get();
  const order = req.body;
  const rateId = req.body.RateId;
  
  if (!req.body.RateId) throw Error('RateId is not defined.');

  let groups = [];
  if (req.user) {
    groups = req.user.Groups;
  } else {
    const group = await Group.findOne({
      where: { isDefault: true },
      include: [
        {
          model: GroupDiscount,
          include: [
            {
              model: Zone,
              as: 'Zones',
            }
          ],
        },
      ],
    });
    if (!group) throw Error('Default User Group is not defined.');
    groups.push(group);
  }

  let rate = await Rate.findOne({
    where: {
      id: req.body.RateId,
    },
    include: [
      {
        model: PackageType,
        required: true,
      },
      {
        model: RateType,
        required: true,
      },
      {
        model: RateRange,
        required: true,
      },
      {
        model: Group,
        required: true,
        where: {
          id: {
            [Sequelize.Op.in]: groups.map((group) => group.id),
          },
        },
      },
      {
        model: Zone,
        required: true,
        include: [
          {
            model: AdditionalService,
            required: false,
            as: 'AdditionalServices',
            where: {
              GroupId: {
                [Sequelize.Op.in]: groups.map((group) => group.id),
              },
            },
          },
          {
            model: Carrier,
            required: true,
            where: {
              isActive: true,
            },
            include: [
              {
                model: RateParam,
                required: true,
                where: {
                  PackageTypeId: {[Sequelize.Op.col]: '"Rate"."PackageTypeId"'},
                  RateTypeId: {[Sequelize.Op.col]: '"Rate"."RateTypeId"'},
                },
              },
            ],
          },
        ],
      },
    ],
  });
  const api = new YandexAPI({
    token: config.yandex.token,
  });
  const result = await api.estimate(order);
  const obj = ratesLib.calcYandexGo({ rate, config: configParams, price: +result.price }); 
  res.json(createJSONResult(obj));
}));

router.post('/create', authMiddleware, aclMiddleware('yandex:create'), asyncHandler(async (req, res, next) => {
  const configParams = await configLib.get();
  const order = req.body;
  
  if (!req.body.RateId) throw Error('RateId is not defined.');

  let groups = [];
  if (req.user) {
    groups = req.user.Groups;
  } else {
    const group = await Group.findOne({
      where: { isDefault: true },
      include: [
        {
          model: GroupDiscount,
          include: [
            {
              model: Zone,
              as: 'Zones',
            }
          ],
        },
      ],
    });
    if (!group) throw Error('Default User Group is not defined.');
    groups.push(group);
  }

  let rate = await Rate.findOne({
    where: {
      id: req.body.RateId,
    },
    include: [
      {
        model: PackageType,
        required: true,
      },
      {
        model: RateType,
        required: true,
      },
      {
        model: RateRange,
        required: true,
      },
      {
        model: Group,
        required: true,
        where: {
          id: {
            [Sequelize.Op.in]: groups.map((group) => group.id),
          },
        },
      },
      {
        model: Zone,
        required: true,
        include: [
          {
            model: AdditionalService,
            required: false,
            as: 'AdditionalServices',
            where: {
              GroupId: {
                [Sequelize.Op.in]: groups.map((group) => group.id),
              },
            },
          },
          {
            model: Carrier,
            required: true,
            where: {
              isActive: true,
            },
            include: [
              {
                model: RateParam,
                required: true,
                where: {
                  PackageTypeId: {[Sequelize.Op.col]: '"Rate"."PackageTypeId"'},
                  RateTypeId: {[Sequelize.Op.col]: '"Rate"."RateTypeId"'},
                },
              },
            ],
          },
        ],
      },
    ],
  });

  const { percentVAT, precision, holidaysDates } = await configLib.get();

  const api = new YandexAPI({
    token: config.yandex.token,
  });
  const result = await api.createOrder(order);
  
  const id = result.id;
  await sleep(5000);
  const info = await api.info(id);
  const price = ratesLib.calcYandexGo({ rate, config: configParams, price: +info.taxi_offer.price_raw, groups });
  const obj = {
    ...order,
    ...price,
    // externalComment: result.comment,
    tracking: result.id
  }
  // console.log(JSON.stringify(obj));
  res.json(createJSONResult(obj));
}));

router.post('/confirm', authMiddleware, aclMiddleware('yandex:confirm'), asyncHandler(async (req, res, next) => {
  const configParams = await configLib.get();
  const rateId = req.body.RateId;
  
  if (!req.body.RateId) throw Error('RateId is not defined.');

  let groups = [];
  if (req.user) {
    groups = req.user.Groups;
  } else {
    const group = await Group.findOne({
      where: { isDefault: true },
      include: [
        {
          model: GroupDiscount,
          include: [
            {
              model: Zone,
              as: 'Zones',
            }
          ],
        },
      ],
    });
    if (!group) throw Error('Default User Group is not defined.');
    groups.push(group);
  }

  let rate = await Rate.findOne({
    where: {
      id: rateId,
    },
    include: [
      {
        model: PackageType,
        required: true,
      },
      {
        model: RateType,
        required: true,
      },
      {
        model: RateRange,
        required: true,
      },
      {
        model: Group,
        required: true,
        where: {
          id: {
            [Sequelize.Op.in]: groups.map((group) => group.id),
          },
        },
      },
      {
        model: Zone,
        required: true,
        include: [
          {
            model: AdditionalService,
            required: false,
            as: 'AdditionalServices',
            where: {
              GroupId: {
                [Sequelize.Op.in]: groups.map((group) => group.id),
              },
            },
          },
          {
            model: Carrier,
            required: true,
            where: {
              isActive: true,
            },
            include: [
              {
                model: RateParam,
                required: true,
                where: {
                  PackageTypeId: {[Sequelize.Op.col]: '"Rate"."PackageTypeId"'},
                  RateTypeId: {[Sequelize.Op.col]: '"Rate"."RateTypeId"'},
                },
              },
            ],
          },
        ],
      },
    ],
  });

  const { percentVAT, precision, holidaysDates } = await configLib.get();

  const api = new YandexAPI({
    token: config.yandex.token,
  });

  const confirmedOrder = await api.info(req.body.tracking);
  const price = ratesLib.calcYandexGo({ rate, config: configParams, price: +confirmedOrder.taxi_offer.price_raw, groups });
  let order = {
    ...req.body,
    ...price,
  };
  const result = await sequelize.transaction(async (t) => {
    const obj = await Order.create({
      ...order,
      pickupTime: moment(),
      addressDetailsFrom: {
        ...order.addressDetailsFrom,
        province: '',
        postCode: '000000',
      },
      addressDetailsTo: {
        ...order.addressDetailsTo,
        province: '',
        postCode: '000000',
      },
      externalComment: order.externalComment,
      paymentType: 'monthlyinvoice',
      orderStatus: 'pending',
      paymentStatus: 'pending',
      RateTypeId: rate.RateType.id,
      CarrierId: rate.Zone.Carrier.id,
      UserId: req.user.id,
      createdById: req.user.id,
      updatedById: req.user.id,
    });

    await Package.destroy({
      where: { OrderId: obj.id }
    });
    
    
    const packagesArr = req.body.packages || [];
    for (let package of packagesArr) {
      package.id = undefined;
      package.OrderId = obj.id;
      package.quantity = Math.trunc(package.quantity),
      await Package.create(package);
    }

    await OrderService.destroy({
      where: { OrderId: obj.id }
    });

    const servicesArr = req.body.services || [];
    for (let service of servicesArr) {
      service.id = undefined;
      service.OrderId = obj.id;
      service.quantity = Math.trunc(service.quantity),
      await OrderService.create(service);
    }

    if (obj.paymentType == 'monthlyinvoice') {
      obj.orderStatus = 'processing';
      obj.paymentStatus = 'contract';
      await obj.save();
    }
  
    const _obj = await Order.findByPk(obj.id);

    return { id: _obj.id, refNo: _obj.refNo };
  });

  res.json(createJSONResult(result));
}));

router.get('/track', authMiddleware, aclMiddleware('yandex:track'), asyncHandler(async (req, res, next) => {
  const order = await Order.findByPk(req.query.id);
  if (!order) throw Error('Order Not Found');
  
  const api = new YandexAPI({
    token: config.yandex.token,
  });

  const info = await api.info(order.tracking);
  order.meta = {
    yandex: info,
  };

  const track = await api.track(order.tracking);
  if (track.orderStatus) {
    order.orderStatus = track.orderStatus;
  }

  await order.save();


  const whereOrder = {
    id: req.query.id,
  };

  if (!req.user) throw Error('No User');
  if (!acl.isAllowed(req.user.role, 'orders:perms-all')) {
    whereOrder.UserId = { [Sequelize.Op.eq]: req.user.id };
  }

  let primaryCompanyId = null;
  const primaryCompany = await Company.findOne({
    where: { isPrimary: true },
  });
  if (!primaryCompany) throw Error('Primary Company is not defined.');
  primaryCompanyId = primaryCompany.id;

  let userCompanyId = req.user.CompanyId;

  let whereUser = {};
  if (userCompanyId != primaryCompanyId) {
    whereUser.CompanyId = userCompanyId;
  }

  let orderExclude = [];
  let serviceExclude = [];
  let includeTag = true;
  if (['client', 'company_manager'].indexOf(req.user.role) > -1) {
    orderExclude.push('companyPrice');
    orderExclude.push('internalComment');
    serviceExclude.push('companyPrice');
    includeTag = false;
  }

  const obj = await Order.findOne({
    where: whereOrder,
    attributes: {
      exclude: orderExclude,
    },
    include: [
      {
        model: User,
        as: 'User',
        attributes: {
          exclude: ['password', 'APIKey'],
        },
        required: true,
        where: whereUser,
      },
      {
        model: Carrier,
      },
      {
        model: Country,
        as: 'CountryFrom',
      },
      {
        model: Country,
        as: 'CountryTo',
      },
      {
        model: Package,
      },
      {
        model: OrderService,
        attributes: {
          exclude: serviceExclude,
        },
      },
      {
        model: OrderStatusHistory,
      },
      {
        model: OrderPaymentStatusHistory,
      },
      {
        model: PackageType,
      },
      {
        model: RateType,
      },
      ...(includeTag ? [
        {
          model: Tag,
        },
      ] : []),
      {
        model: User,
        as: 'createdBy',
        attributes: {
          exclude: ['password', 'APIKey'],
        },
      },
      {
        model: User,
        as: 'updatedBy',
        attributes: {
          exclude: ['password', 'APIKey'],
        },
      },
    ],
  });
  
  if (!obj) return res.status(404).json(createJSONError(new Error('Order not found or cannot be accessed')));
  if (obj && obj.attachments && Array.isArray(obj.attachments)) {
    obj.attachments = obj.attachments.map((attachment) => {
      const signature = md5(config.secret_key + '|' + attachment.id);
      attachment.signature = signature;
      if (req.query.attachments_data && req.query.attachments_data == 'none') attachment.data = null;

      return attachment;
    })
  }
  
  res.json(createJSONResult(obj));
}));

module.exports = router;
