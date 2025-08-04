const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');
const acl = require('../acl');

const { Order, OrderStatusHistory, OrderPaymentStatusHistory, Package, OrderService, OrderHistory, OrderAPILog, Tag, OrderTag, User, Carrier, Address, Region, RegionRule, Country, PackageType, Zone, Rate, RateType, RateRange, RateParam, Group, GroupDiscount, AdditionalService, Company, Sequelize, sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');

const ratesLib = require('../libs/rates');
const configLib = require('../libs/config');
const mailerLib = require('../libs/mailer');

const tmp = require('tmp-promise');
const fs = require('fs');
const util = require('util');
const path = require('path');
const fsWriteAsync = util.promisify(fs.write);
const fsReadFileAsync = util.promisify(fs.readFile);
const fsDeleteFileAsync = util.promisify(fs.unlink);
const dataUriToBuffer = require('data-uri-to-buffer');

const puppeteer = require('puppeteer');
const hb = require('handlebars');

const config = require('../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

const _round = require('lodash/round');
const md5 = require('md5');

const createAPI = require('../libs/api/factory');


router.get('/', authMiddleware, aclMiddleware('orders:list'), asyncHandler(async (req, res, next) => {
  let {
    where,
    order = '',
    limit = 1000,
    offset = 0,
  } = req.query;

  if (order == '') order = 'id|desc';
  let [ orderField, orderType ] = order.split('|');
  let orderOrder;
  if (orderField == 'countryCodeFrom') {
    orderOrder = [['countryCodeFrom', orderType]];
  } else if (orderField == 'countryCodeTo') {
    orderOrder = [['countryCodeTo', orderType]];
  } else if (orderField == 'customer') {
    orderOrder = [[Sequelize.literal(`"User.prettyName"`), orderType]];
  } else if (orderField == 'carrier') {
    orderOrder = [[Sequelize.literal(`"Carrier.id"`), orderType]];
  } else if (orderField == 'tags') {
    orderOrder = [[Sequelize.literal(`"Tag.id"`), orderType]];
  } else {
    orderOrder = [[orderField, orderType]];
  }

  let primaryCompanyId = null;
  const primaryCompany = await Company.findOne({
    where: { isPrimary: true },
  });
  if (!primaryCompany) throw Error('Primary Company is not defined.');
  primaryCompanyId = primaryCompany.id;

  let userCompanyId = req.user.CompanyId;

  where = where ? JSON5.parse(where) : {};
  //console.log(_where);

  let whereOrder = {};
  if (where.id) whereOrder.id = { [Sequelize.Op.eq]: where.id };
  if (where.refNo) whereOrder.refNo = { [Sequelize.Op.iLike]: '%' + where.refNo + '%' };
  if (where.totalPrice) whereOrder.totalPrice = { [Sequelize.Op.eq]: where.totalPrice };
  if (where.paymentStatus && where.paymentStatus.length > 0) whereOrder.paymentStatus = { [Sequelize.Op.in]: where.paymentStatus };
  if (where.orderStatus && where.orderStatus.length > 0) whereOrder.orderStatus = { [Sequelize.Op.in]: where.orderStatus };
  if (where.addressFrom) whereOrder.addressFrom = { [Sequelize.Op.iLike]: '%' + where.addressFrom + '%' };
  if (where.addressTo) whereOrder.addressTo = { [Sequelize.Op.iLike]: '%' + where.addressTo + '%' };
  if (where.tracking) whereOrder.tracking = { [Sequelize.Op.iLike]: '%' + where.tracking + '%' };
  if (where.countryCodeFrom) whereOrder.countryCodeFrom = { [Sequelize.Op.eq]: where.countryCodeFrom.toUpperCase() };
  if (where.countryCodeTo) whereOrder.countryCodeTo = { [Sequelize.Op.eq]: where.countryCodeTo.toUpperCase() };
  if (where.carrier && where.carrier.length > 0) whereOrder.CarrierId = { [Sequelize.Op.in]: where.carrier };
  if (where.createdAt) {
    let [createdAtBegin, createdAtEnd] = where.createdAt.split('|');
    createdAtBegin  = moment.tz(createdAtBegin + ' 00:00:00', config.timezone);
    createdAtEnd    = moment.tz(createdAtEnd + ' 00:00:00', config.timezone).add(1, 'days');
    //console.log(createdAtBegin, createdAtEnd);
    whereOrder.createdAt = { [Sequelize.Op.between]: [createdAtBegin, createdAtEnd] };
  }

  if (acl.isAllowed(req.user.role, 'orders:perms-all')) {
    if (where.userId) whereOrder.UserId = { [Sequelize.Op.eq]: where.userId };
  } else {
    whereOrder.UserId = { [Sequelize.Op.eq]: req.user.id };
  }

  let whereTag = {};
  let tagRequired = false;
  if (where.tags && where.tags.length > 0) {
    tagRequired = true;
    whereTag.id = { [Sequelize.Op.in]: where.tags };
  } 

  let whereUser = {};
  if (userCompanyId != primaryCompanyId) {
    whereUser.CompanyId = userCompanyId;
  }
  if (where.customer) whereUser.prettyName = { [Sequelize.Op.iLike]: '%' + where.customer + '%' };
  let userRequired = Object.keys(whereUser).length > 0
    || Object.getOwnPropertySymbols(whereUser).length > 0;

  let orderExclude = ['attachments'];
  let serviceExclude = [];
  let includeTag = true;
  if (['client', 'company_manager'].indexOf(req.user.role) > -1) {
    orderExclude.push('companyPrice');
    orderExclude.push('internalComment');
    serviceExclude.push('companyPrice');
    includeTag = false;
  }
  
  let orderInclude = []; // still has wrong count if more than one tag selected
  if (where.tags && where.tags.length > 0) {
    orderInclude.push({
      model: Tag,
      where: whereTag,
    });
  }
  
  const count = await Order.count({
    where: whereOrder,
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
      ...orderInclude,
    ]
  });

  const rows = await Order.findAll({
    where: whereOrder,
    order: orderOrder,
    limit: limit,
    offset: offset,
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
        required: true,
      },
      {
        model: Country,
        as: 'CountryFrom',
      },
      {
        model: Country,
        as: 'CountryTo',
      },
      //{
      //  model: Package,
      //},
      //{
      //  model: OrderService,
      //  attributes: {
      //    exclude: serviceExclude,
      //  },
      //},
      {
        model: PackageType,
      },
      {
        model: RateType,
      },
      ...(includeTag ? [
        {
          model: Tag,
          where: whereTag,
          required: tagRequired,
        },
      ] : []),
    ],
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('orders:get'), asyncHandler(async (req, res, next) => {
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

router.get('/history', authMiddleware, aclMiddleware('orders:history'), asyncHandler(async (req, res, next) => {
  let limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;

  const obj = await OrderHistory.findAll({
    where: { OrderId: req.query.id },
    order: [['id', 'DESC']],
    limit,
  });
  res.json(createJSONResult(obj));
}));

router.get('/api_log', authMiddleware, aclMiddleware('orders:api_log'), asyncHandler(async (req, res, next) => {
  let limit = req.query.limit ? parseInt(req.query.limit, 10) : 10;

  const obj = await OrderAPILog.findAll({
    where: { OrderId: req.query.id },
    order: [['id', 'DESC']],
    limit,
  });
  res.json(createJSONResult(obj));
}));

router.get('/attachment/download', authMiddleware, aclMiddleware('orders:attachment_download'), asyncHandler(async (req, res, next) => {
  const { orderId = '', attachmentId = '', signature = '' } = req.query;
  const obj = await Order.findOne({
    where: { id: orderId }
  });
  if (!obj) return res.status(404).send(createJSONError(new Error('Order Not Found')));

  const attachment = obj.attachments.filter((n) => n.id == attachmentId)[0];
  if (!attachment) return res.status(404).send(createJSONError(new Error('Attachment Not Found')));

  const hash = md5(config.secret_key + '|' + attachment.id);
  if (hash != signature) return res.status(403).send(createJSONError(new Error('Signature Invalid')));

  const {fd, path, cleanup} = await tmp.file({ prefix: 'dl_', postfix: '_' + attachment.name });
  const decoded = await dataUriToBuffer(attachment.data);
  await fsWriteAsync(fd, decoded);
  res.download(path, attachment.name, function (err) {
    if (err) {
      next(err);
    } else {
      //console.log('Sent:', path);
      cleanup();
    }
  });
}));

router.post('/add', authMiddleware, aclMiddleware('orders:add'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {
    const obj = await Order.create({
      ...req.body,
      createdById: req.user.id,
      updatedById: req.user.id,
    });

    await Package.destroy({
      where: { OrderId: obj.id }
    });

    const packagesArr = req.body.packages || [];
    for (let package of packagesArr) {
      package.OrderId = obj.id;
      package.quantity = Math.trunc(package.quantity),
      await Package.create(package);
    }

    await OrderService.destroy({
      where: { OrderId: obj.id }
    });

    const servicesArr = req.body.services || [];
    for (let service of servicesArr) {
      service.OrderId = obj.id;
      service.quantity = Math.trunc(service.quantity),
      await OrderService.create(service);
    }

    await OrderTag.destroy({
      where: { OrderId: obj.id }
    });

    const tagsArr = req.body.tags || [];
    for (let tag of tagsArr) {
      await OrderTag.create({
        OrderId: obj.id,
        TagId: tag,
      });
    }

    return obj;
  });
  res.json(createJSONResult(result));
}));

router.post('/edit', authMiddleware, aclMiddleware('orders:edit'), asyncHandler(async (req, res, next) => {
  const whereOrder = {
    id: req.body.id,
  };

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

  const result = await sequelize.transaction(async (t) => {
    const obj = await Order.findOne({
      where: whereOrder,
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
      ],
    });
    for (let field in req.body) {
      obj[field] = req.body[field];
    }
    obj.updatedById = req.user.id;
    const _result = await obj.save();

    await Package.destroy({
      where: { OrderId: obj.id }
    });

    const packagesArr = req.body.packages || [];
    for (let package of packagesArr) {
      package.OrderId = obj.id;
      package.quantity = Math.trunc(package.quantity),
      await Package.create(package);
    }

    await OrderService.destroy({
      where: { OrderId: obj.id }
    });

    const servicesArr = req.body.services || [];
    for (let service of servicesArr) {
      service.OrderId = obj.id;
      service.quantity = Math.trunc(service.quantity),
      await OrderService.create(service);
    }

    await OrderTag.destroy({
      where: { OrderId: obj.id }
    });

    const tagsArr = req.body.tags || [];
    for (let tag of tagsArr) {
      await OrderTag.create({
        OrderId: obj.id,
        TagId: tag,
      });
    }

    return _result;
  });
  res.json(createJSONResult(result));
}));

router.post('/mass_edit', authMiddleware, aclMiddleware('orders:mass_edit'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  delete req.body.id;

  if (Array.isArray(id)) {
    var where = {
      id: { [Sequelize.Op.in]: id },
    };
    if (!acl.isAllowed(req.user.role, 'orders:perms-all')) where['UserId'] = req.user.id;
  } else {
    var where = {
      id,
    };
    if (!acl.isAllowed(req.user.role, 'orders:perms-all')) where['UserId'] = req.user.id;
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

  const result = await sequelize.transaction(async (t) => {
    const objList = await Order.findAll({
      where: where,
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
      ],
    });

    for (let obj of objList) {
      for (let field in req.body) {
        obj[field] = req.body[field];
      }
      obj.updatedById = req.user.id;
      let _result = await obj.save();
    }

    return true;
  });
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('orders:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = {
      id: { [Sequelize.Op.in]: id },
    };
    if (!acl.isAllowed(req.user.role, 'orders:perms-all')) where['UserId'] = req.user.id;
  } else {
    var where = {
      id,
    };
    if (!acl.isAllowed(req.user.role, 'orders:perms-all')) where['UserId'] = req.user.id;
  }

  const result = await sequelize.transaction(async (t) => {
    const objList = await Order.findAll({
      where,
    });

    for (let obj of objList) {
      let _result = await obj.destroy();
    }

    return true;
  });

  res.json(createJSONResult(result));
}));

router.post('/place', authMiddleware, aclMiddleware('orders:place'), asyncHandler(async (req, res, next) => {
  if (!req.body.RateId) throw Error('RateId is not defined.');


  if (moment(req.body.pickupTime).isBefore(moment().startOf('day'))) {
    console.log('********************************************');
    console.warn('request body pickupTime is: ', req.body.pickupTime);
    console.warn('start of the day date is: ', moment().startOf('day'));
    console.log('********************************************');

    throw Error('Order pickupTime is in the past. You invented a time machine? :)');
  }

  let { data: foundRates } = await ratesLib.ratesSearch({
    fromCountryId: req.body.addressDetailsFrom.CountryId,
    toCountryId: req.body.addressDetailsTo.CountryId,
    fromPostCode: req.body.addressDetailsFrom.postCode,
    toPostCode: req.body.addressDetailsTo.postCode,
    fromFiasGUID: req.body.addressDetailsFrom.fiasGUID,
    toFiasGUID: req.body.addressDetailsTo.fiasGUID,
    packageTypeId: req.body.PackageTypeId,
    packages: req.body.packages,
    declaredValue: req.body.declaredValue,
    limit: 100,
    offset: 0,
    user: req.user,
  });

  foundRates = foundRates.map((n) => n.id);
  if (!foundRates.includes(req.body.RateId)) throw Error('RateId does not match the search criteria or inactive. Please make rates search to ensure.');


  let groups = [];
  if (req.user) {
    groups = req.user.Groups;
  } else {
    throw Error('User not logged in.')
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
          /*{
            model: Region,
            required: true,
            as: 'RegionsFrom',
            include: [
              {
                model: Country,
                required: true,
              },
              {
                model: RegionRule,
                required: true,
              },
            ],
          },
          {
            model: Region,
            required: true,
            as: 'RegionsTo',
            include: [
              {
                model: Country,
                required: true,
              },
              {
                model: RegionRule,
                required: true,
              },
            ],
          },*/
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
            //attributes: { exclude: ['logo'] },
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

  let packages = req.body.packages;
  let services = req.body.services;
  let declaredValue = req.body.declaredValue;

  const { percentVAT, precision, holidaysDates, pickupDatesCount } = await configLib.get();

  const validPickupDates = ratesLib.calcPickupDates(pickupDatesCount, holidaysDates, rate);
  const validPickupDatesFormatted = validPickupDates.map((n) => moment(n).format('YYYY-MM-DD'));
  //console.log('@pickupDates: ', validPickupDates, req.body.pickupTime);
  
  if (!validPickupDatesFormatted.includes(moment(req.body.pickupTime).format('YYYY-MM-DD'))) {
    throw Error('Allowed pickupTime dates are: ' + JSON.stringify(validPickupDates));
  }
  

  const round = (num) => _round(num, precision);

  rate = rate.toJSON();
  let isMultiPackage = rate.Zone.Carrier.RateParams[0].isMultiPackage;

  let _packages = ratesLib.calcPackagesPrice({ rate, packages, isMultiPackage, groups, precision                           });
  if (!_packages) return res.json(createJSONResult(null));
  let {
    clientTotalDiscount,
    packagesTotalDiscountPrice,
    packagesTotalFuelTax,
    packagesTotalPrice,
  } = _packages;

  packages = _packages.packages.map((package) => ({
    ...package,
    volumeWeight: package.price.volumeWeight,
  }));

  let insurance = ratesLib.calcInsuranceIncluded({ rate, declaredValue, precision });

  let priceTaxExcluded = round(+(packagesTotalPrice));

  let taxVAT = 0;
  let percentVATFinal = 0;
  if (rate.Zone.hasVAT) {
    taxVAT = round(+(priceTaxExcluded * (parseFloat(percentVAT) / 100)));
    percentVATFinal = percentVAT;
  }

  let priceTaxIncluded = priceTaxExcluded + taxVAT + insurance;

  services = await Promise.all(services.map(async (service) => {
    let additionalService = await AdditionalService.findByPk(service.id);
    let s = { ...additionalService.toJSON(), quantity: service.quantity };
    return s;
  }));
  // //console.log(services);

  services = ratesLib.calcServicesPrice({ services, deliveryCost: priceTaxExcluded, declaredValue, precision, percentVAT });
  const servicesPrice = services.reduce((a, v) => (a + (v.quantity ? +v.quantity : 1) * v.clientPrice), 0);

  let totalPrice = round(priceTaxIncluded + (+servicesPrice));

  let overrideParams = {};
  if (rate && rate.Zone.Carrier.isRateByCarrierApi) {

    const api = createAPI(rate.Zone.Carrier.api);

    let carrierRate = await api.getRate({
      ...req.body,
      rate,
    });
    
    if (Array.isArray(carrierRate)) carrierRate = carrierRate[0];
    
    // console.warn('!DEBUG: rate-by-api ', carrierRate);
    if (!carrierRate) return null;
    if (carrierRate.errors) return null;

	  isVATIncluded = rate.Zone.Carrier.isVATIncluded;
	  isFuelTaxIncluded = rate.Zone.Carrier.isFuelTaxIncluded;

    overrideParams = ratesLib.calcRateByPrice({ rate, packages, config: await configLib.get(), price: carrierRate.price, isVATIncluded, isFuelTaxIncluded, groups });
  }

  let order = {
    ...req.body,
    packages: packages,
    clientDiscount: clientTotalDiscount,
    percentVAT: percentVATFinal,
    companyPrice: packagesTotalDiscountPrice,
    clientPrice: packagesTotalPrice,
    fuelTax: packagesTotalFuelTax,
    insurance: insurance,
    taxVAT: taxVAT,
    totalPrice: totalPrice,
    ...overrideParams,
  };

  const result = await sequelize.transaction(async (t) => {
    const obj = await Order.create({
      ...order,
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

    const packagesArr = packages || [];
    for (let package of packagesArr) {
      package.id = undefined;
      package.OrderId = obj.id;
      package.quantity = Math.trunc(package.quantity),
      await Package.create(package);
    }

    await OrderService.destroy({
      where: { OrderId: obj.id }
    });

    const servicesArr = services || [];
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
    const _config = await configLib.get();
    const _user = req.user;

    if (_config.newOrderNotification) {
      await mailerLib.sendFromTemplate({
        message: {
          from: config.robotEmailFrom,
          to: _config.newOrderNotificationEmail,
          subject: config.emailSubjects.newOrderNotification,
        },
        template: 'new_order_notification',
        data: {
          order: {
            refNo: _obj.refNo,
            addressFrom: _obj.addressFrom,
            addressTo: _obj.addressTo,
            contents: !!_obj.contents ? (_obj.contents + ' (Посылка)') : 'Документы',
            pickupDate: moment(_obj.pickupTime).format('DD.MM.YY'),
            user: `${_user.prettyName} ${!!_user.companyName ? _user.companyName : ''}`,
            rateName: rate.name.ru,
            rateType: rate.RateType.type,
            carrierName: rate.Zone.Carrier.name.ru,
          },
          config: _config,
        },
      });
    }

    return { id: _obj.id, refNo: _obj.refNo };
  });
  res.json(createJSONResult(result));
}));

router.post('/calc', authMiddleware, aclMiddleware('orders:calc'), asyncHandler(async (req, res, next) => {
  if (!req.body.UserId) throw Error('User is not defined.');
  if (!req.body.RateId) throw Error('Rate is not defined.');
  if (!req.body.packages) throw Error('Packages are not defined.');
  if (!req.body.services) throw Error('Services are not defined.');
  if (
    typeof req.body.declaredValue == 'undefined' ||
    (req.body.declaredValue === '' || req.body.declaredValue != +req.body.declaredValue)
  ) throw Error('Declared Value is not defined.');

  let user = await User.findOne({
    where: { id: req.body.UserId },
    attributes: {
      exclude: ['password', 'APIKey'],
    },
    required: true,
    include: [
      {
        model: Group,
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
      },
    ],
  });

  let groups = user.Groups;

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
          /*{
            model: Region,
            required: true,
            as: 'RegionsFrom',
            include: [
              {
                model: Country,
                required: true,
              },
              {
                model: RegionRule,
                required: true,
              },
            ],
          },
          {
            model: Region,
            required: true,
            as: 'RegionsTo',
            include: [
              {
                model: Country,
                required: true,
              },
              {
                model: RegionRule,
                required: true,
              },
            ],
          },*/
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
            //attributes: { exclude: ['logo'] },
            // where: {
            //   isActive: true,
            // },
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

  let packages = req.body.packages;
  let services = req.body.services;
  let declaredValue = req.body.declaredValue;

  const { percentVAT, precision, holidaysDates } = await configLib.get();

  const round = (num) => _round(num, precision);

  rate = rate.toJSON();

  let isMultiPackage = rate.Zone.Carrier.RateParams[0].isMultiPackage;

  let _packages = ratesLib.calcPackagesPrice({ rate, packages, isMultiPackage, groups, precision });
  if (!_packages) return res.json(createJSONResult(null));
  let {
    clientTotalDiscount,
    packagesTotalDiscountPrice,
    packagesTotalFuelTax,
    packagesTotalPrice,
  } = _packages;

  packages = _packages.packages.map((package) => ({
    ...package,
    volumeWeight: package.price.volumeWeight,
  }));

  let insurance = ratesLib.calcInsuranceIncluded({ rate, declaredValue, precision });

  let priceTaxExcluded = round(+(packagesTotalPrice));

  let taxVAT = 0;
  
  let percentVATFinal = 0;
  if (rate.Zone.hasVAT) {
    taxVAT = round(+(priceTaxExcluded * (parseFloat(percentVAT) / 100)));
    percentVATFinal = percentVAT;
  }

  let priceTaxIncluded = priceTaxExcluded + taxVAT + insurance;

  const servicesPrice = services.reduce((a, v) => (a + (v.quantity ? +v.quantity : 1) * v.clientPrice), 0);

  let totalPrice = round(priceTaxIncluded + (+servicesPrice));

// *********************************
//  Carrier-By-API w/o services block calc 
// console.warn(req.body);
let overrideParams = {};
const addressDetailsFrom = req.body.addressDetailsFrom;
const addressDetailsTo = req.body.addressDetailsTo;

if (rate && rate.Zone.Carrier.isRateByCarrierApi) {

  const api = createAPI(rate.Zone.Carrier.api);

  const carrierRate = await api.getRate({
    addressDetailsFrom,
    addressDetailsTo,
    packages,
    rate,
  });
  console.warn('!DEBUG: recalc rate-by-api ', carrierRate);
  // console.warn('!price-by-rate: ', packages);

  if (carrierRate.errors) return null;

  isVATIncluded = rate.Zone.Carrier.isVATIncluded;
  isFuelTaxIncluded = rate.Zone.Carrier.isFuelTaxIncluded;
  
  overrideParams = ratesLib.calcRateByPrice({ rate, packages, config: await configLib.get(), price: carrierRate.price, isVATIncluded, isFuelTaxIncluded, groups });
}

// *********************************
  let orderCalc = {
    packages: packages,
    clientDiscount: clientTotalDiscount,
    percentVAT: percentVATFinal,
    companyPrice: packagesTotalDiscountPrice,
    clientPrice: packagesTotalPrice,
    fuelTax: packagesTotalFuelTax,
    insurance: insurance,
    taxVAT: taxVAT,
    totalPrice: totalPrice,
    ...overrideParams,
  };
  console.log('price-by-api: ', orderCalc);

  res.json(createJSONResult(orderCalc));
}));

router.get('/invoice/download', authMiddleware, aclMiddleware('orders:invoice_download'), asyncHandler(async (req, res, next) => {
  const whereOrder = {
    id: req.query.id,
  };

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
  if (['client', 'company_manager'].indexOf(req.user.role) > -1) orderExclude.push('companyPrice');

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

  if (!obj) return res.status(404).send(createJSONError(new Error('Order Not Found')));

  const invoiceFilePath = `/tmp/invoice-${obj.id}.pdf`;

  async function getTemplateHtml() {
    //console.log("Loading template file in memory")
    try {
      const invoicePath = path.resolve(path.dirname(__filename) + `/../config/invoices/${config.type}/invoice.html`);

      return await fsReadFileAsync(invoicePath, 'utf8');
    } catch (err) {
      // console.warn(config);
      return Promise.reject("Could not load html template!");
    }
  }

  async function generatePdf(data = {}) {
    const res = await getTemplateHtml();

    const template = hb.compile(res, { strict: true });
    const result = template(data);
    const html = result;

    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.setContent(html);

    await page.pdf({ path: invoiceFilePath, format: 'A4' });

    await browser.close();
    //console.log("PDF Generated");
  }

  const order = {
    ...obj.toJSON(),
    createdAtPretty: moment(obj.createdAt).format('YYYY-MM-DD'),
  };

  // const config = await configLib.get();

  //console.log('order: ', order);
  //console.log('config: ', config);

  await generatePdf({ order, config: await configLib.get() });

  res.download(invoiceFilePath, 'invoice.pdf', async function (err) {
    if (err) {
      next(err);
    } else {
      //console.log('Sent:', invoiceFilePath);
      await fsDeleteFileAsync(invoiceFilePath);
    }
  });
}));

module.exports = router;