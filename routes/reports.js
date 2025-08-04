const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');
const acl = require('../acl');

const { Order, OrderStatusHistory, OrderPaymentStatusHistory, Package, OrderService, User, Carrier, Address, Region, RegionRule, Country, PackageType, Zone, Rate, RateType, RateRange, RateParam, Group, AdditionalService, Company, SalesClient, Sequelize, sequelize } = require('../models');

const config = require('../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

const tmp = require('tmp-promise');
const fs = require('fs');
const util = require('util');
const path = require('path');
const fsWriteFileAsync = util.promisify(fs.writeFile);
const fsReadFileAsync = util.promisify(fs.readFile);
const fsDeleteFileAsync = util.promisify(fs.unlink);
const dataUriToBuffer = require('data-uri-to-buffer');

const jexcel = require('xls-write');
//const Z = require("zebras");

const configLib = require('../libs/config');
const fileLib = require('../libs/file');
const _round = require('lodash/round');
const _get = require ('lodash/get');
const _groupBy = require ('lodash/groupBy');
const _sortBy = require ('lodash/sortBy');


const translations = {
  orders: {
    entity: 'Заказ',
    entities: 'Заказы',
    titles: {
      id: 'ID',
      refNo: 'Реф No.',
      customer: 'Клиент',
      total: 'Стоимость',
      addressFrom: 'Адрес отправителя',
      addressTo: 'Адрес получателя',
      countryFrom: 'Страна из',
      countryTo: 'Страна в',
      cntyFrom: 'Страна из',
      cntyTo: 'Страна в',
      carrier: 'Перевозчик',
      tracking: 'Трекинг',
      paymentStatus: 'Статус платежа',
      paymentType: 'Тип оплаты',
      orderStatus: 'Статус заказа',
      createdBy: 'Заказ создан',
      updatedBy: 'Заказ обновлен',
      packages: 'Пакеты',
      companyPrice: 'Цена для компании',
      clientPrice: 'Цена для клиента',
      fuelTax: 'Топливный сбор',
      insurance: 'Страховка',
      taxVAT: 'НДС',
      services: 'Услуги',
      totalPrice: 'Общая стоимость',
      attachments: 'Прикрепленные файлы',
      externalComment: 'Пользовательский комментарий',
      internalComment: 'Внутренний комментарий',
      contents: 'Содержимое',
      declaredValue: 'Оъявленная стоимость',
      pickupTime: 'Время забора',
      packageType: 'Тип посылки',
      rateType: 'Тип тарифа',
      percentVAT: 'НДС %',
      clientDiscount: 'Скидки клиента %',
      langCode: 'Язык заказа',
    },
    orderStatuses: {
      pending: 'Ожидание',
      processing: 'Обработка',
      attention: 'Уточнение',
      confirmed: 'Подтвержден',
      declined: 'Отклонен',
      returned: 'Возвращен',
      destroyed: 'Уничтожен',
      canceled: 'Отменен',
      in_transit: 'В пути',
      delivered: 'Доставлен',
      idle_run: 'Холостой пробег',
      not_delivered: 'Не доставлен',
    },
    paymentStatuses: {
      pending: 'Ожидание',
      authorized: 'Авторизовано',
      confirmed: 'Подтверждено',
      refunded: 'Возвращено',
      failed: 'Ошибка',
      canceled: 'Отменено',
      contract: 'Контрактный',
    },
    paymentTypes: {
      cloudpayments: 'Cloud Payments',
      bankwire: 'Банковский перевод',
      monthlyinvoice: 'Месячный инвойс',
    },
    goToChat: 'Перейти в чат',
  },

  package: {
    types: {
      documents: 'Документы',
      box: 'Посылка',
      pallet: 'Паллет',
      custom: 'Нестандартный',
    },
  },

  rate: {
    types: {
      standard: 'Стандарт',
      economy: 'Эконом',
      express: 'Экспресс',
      super_express: 'Супер-экспресс',
      daily: 'Суточная',
    },
  },
};

const _ = (key) => {
  const message = _get(translations, key);

  if (!message) {
    return key;
  }

  return message;
}



router.get('/', authMiddleware, aclMiddleware('reports:list'), asyncHandler(async (req, res, next) => {
  res.json(createJSONResult(true));
}));

router.get('/orders', authMiddleware, aclMiddleware('reports:orders'), asyncHandler(async (req, res, next) => {
  let {
    where,
    type = 'full',
    downloadToken = '',
  } = req.query;

  if (!acl.isAllowed(req.user.role, 'reports:orders_type_' + type)) throw Error('Not Allowed!');

  where = where ? JSON5.parse(where) : {};

  let whereOrder = {};
  let whereUser  = {};
  let whereGroup = {};

  if (where.createdAt) {
    let [createdAtBegin, createdAtEnd] = where.createdAt.split('|');
    createdAtBegin  = moment.tz(createdAtBegin + ' 00:00:00', config.timezone);
    createdAtEnd    = moment.tz(createdAtEnd + ' 00:00:00', config.timezone).add(1, 'days');
    //console.log(createdAtBegin, createdAtEnd);
    whereOrder.createdAt = { [Sequelize.Op.between]: [createdAtBegin, createdAtEnd] };
  }
  if (where.CompanyId) whereUser.CompanyId = where.CompanyId;
  if (where.CarrierId) whereOrder.CarrierId = where.CarrierId;
  if (where.GroupId) whereGroup.id = where.GroupId;
  if (where.orderStatus && Array.isArray(where.orderStatus) && where.orderStatus.length > 0) {
    whereOrder.orderStatus = { [Sequelize.Op.in]: where.orderStatus };
  }
  if (where.paymentStatus && Array.isArray(where.paymentStatus) && where.paymentStatus.length > 0) {
    whereOrder.paymentStatus = { [Sequelize.Op.in]: where.paymentStatus };
  }
  //console.log(whereOrder);
  if (acl.isAllowed(req.user.role, 'reports:perms-all')) {
    if (where.UserId) whereOrder.UserId = where.UserId;
  } else {
    whereOrder.UserId = req.user.id;
  }

  let primaryCompanyId = null;
  const primaryCompany = await Company.findOne({
    where: { isPrimary: true },
  });
  if (!primaryCompany) throw Error('Primary Company is not defined.');
  primaryCompanyId = primaryCompany.id;

  let userCompanyId = req.user.CompanyId;

  if (userCompanyId != primaryCompanyId) {
    whereUser.CompanyId = userCompanyId;
  }

  const { precision } = await configLib.get();
  const round = (num) => _round(num, precision);

  let serviceCodes = await OrderService.findAll({
    attributes: ['code'],
    group: ['code']
  });
  serviceCodes = serviceCodes.map((serviceCode) => serviceCode.code);
  //console.log(serviceCodes);

  let rows = await Order.findAll({
    where: whereOrder,
    order: [['id', 'ASC']],
    attributes: {
      exclude: ['attachments'],
    },
    include: [
      {
        model: User,
        as: 'User',
        attributes: {
          exclude: ['password', 'APIKey'],
        },
        where: whereUser,
        required: true,
        include: [
          {
            model: Company,
            required: true,
            include: [
              {
                model: SalesClient,
                as: 'SalesUsers', 
                include: [
                  {
                    model: User,
                  }
                ]
              }
            ],
          },
          {
            model: Group,
            where: whereGroup,
            required: true,
          },
          {
            model: SalesClient,
            as: 'SalesUsers',
            include: [
              {
                model: User,
              }
            ]
          },
        ],
      },
      {
        model: Carrier,
        attributes: {
          exclude: ['logo'],
        },
        required: true,
        include: [
          {
            model: RateParam,
            required: true,
            where: {
              PackageTypeId: {[Sequelize.Op.col]: '"Order"."PackageTypeId"'},
              RateTypeId: {[Sequelize.Op.col]: '"Order"."RateTypeId"'},
            },
          },
        ],
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
        model: PackageType,
      },
      {
        model: RateType,
      },
    ],
  });


  const reportFileName = 'report_orders_' + type + '_' + (new Date().getTime()) + '.xlsx';
  const reportFilePath = '/tmp/' + reportFileName;

  let header;

  if (type == 'full') {
    header = [
      { counter: '№' },
      { createdAt: 'Дата заказа' },
      { refNo: 'Реф No.' },
      { company: 'Компания' },
      { userEmail: 'Логин клиента' },
      { companyName: 'Организация' },
      { addressFrom: 'Отправитель' },
      { addressTo: 'Получатель' },
      { carrier: 'Перевозчик' },
      { packageType: 'Тип посылки' },
      { rateType: 'Тип тарифа' },
      { tracking: 'Трекинг' },
      { packages: 'Пакеты' },
      { physicalWeight: 'Физический вес, kg' },
      { volumeWeight: 'Объемный вес, kg' },
      { calcWeight: '"Платный" вес, kg' },
      { countryCodeFrom: 'Страна отправителя' },
      { cityFrom: 'Город отправителя' },
      { countryCodeTo: 'Страна получателя' },
      { cityTo: 'Город получателя' },
      { orderStatus: 'Статус заказа' },
      { paymentStatus: 'Статус платежа' },
      { clientPriceTaxIncluded: 'Тариф клиента, вкл. налоги' },
      { companyPriceTaxIncluded: 'Себестоимость тариф, вкл. налоги' },
      { clientDiscount: 'Скидка на отправку %' },
      { income: 'Прибыль на доставке' },
      { margin: 'Маржа на доставке %' },
      { contents: 'Вложение' },
      { declaredValue: 'Стоимость вложения' },
    ];

    serviceCodes.forEach((serviceCode) => {
      let headerVal;

      headerVal = {}; headerVal['serviceClientPriceTaxIncluded_' + serviceCode] = 'Цена для клиента Услуга "' + serviceCode + '"'; header.push(headerVal);
      headerVal = {}; headerVal['serviceCompanyPriceTaxIncluded_' + serviceCode] = 'Себестоимость Услуга "' + serviceCode + '"'; header.push(headerVal);
      headerVal = {}; headerVal['serviceIncome_' + serviceCode] = 'Прибыль Услуга "' + serviceCode + '"'; header.push(headerVal);
    });

    header = [
      ...header,
      { serviceClientPriceTaxIncludedTotal: 'Цена для клиента Все Услуги' },
      { serviceCompanyPriceTaxIncludedTotal: 'Себестоимость Все Услуги' },
      { serviceIncomeTotal: 'Прибыль Все Услуги' },
      { totalPrice: 'Итого к оплате' },
    ];
  } else if (type == 'short') {
    header = [
      { counter: '№' },
      { createdAt: 'Дата заказа' },
      { refNo: 'Реф No.' },
      { company: 'Компания' },
      { userEmail: 'Логин клиента' },
      { companyName: 'Организация' },
      { carrier: 'Перевозчик' },
      { packageType: 'Тип посылки' },
      { rateType: 'Тип тарифа' },
      { tracking: 'Трекинг' },
      { packages: 'Пакеты' },
      { calcWeight: '"Платный" вес, kg' },
      { countryCodeFrom: 'Страна отправителя' },
      { cityFrom: 'Город отправителя' },
      { countryCodeTo: 'Страна получателя' },
      { cityTo: 'Город получателя' },
      { orderStatus: 'Статус заказа' },
      { paymentStatus: 'Статус платежа' },
      { cashAssignment: 'Наложенный платеж' },
      { clientPriceTaxIncluded: 'Тариф клиента, вкл. налоги' },
      { companyPriceTaxIncluded: 'Себестоимость тариф, вкл. налоги' },
      { clientDiscount: 'Скидка на отправку %' },
      { income: 'Прибыль на доставке' },
      { margin: 'Маржа на доставке %' },
      { declaredValue: 'Стоимость вложения' },
    ];
  } else if (type == 'client') {
    header = [
      { counter: '№' },
      { createdAt: 'Дата заказа' },
      { refNo: 'Реф No.' },
      { userEmail: 'Логин клиента' },
      { companyName: 'Организация' },
      { orderStatus: 'Статус заказа' },
      { addressFrom: 'Отправитель' },
      { addressTo: 'Получатель' },
      { carrier: 'Перевозчик' },
      { tracking: 'Трекинг' },
      { packages: 'Пакеты' },
      { packageType: 'Тип посылки' },
      { physicalWeight: 'Физический вес, kg' },
      { volumeWeight: 'Объемный вес, kg' },
      { contents: 'Описание вложения' },
      { declaredValue: 'Стоимость вложения' },
      { insurance: 'Страхование' },
      { clientPriceTaxIncluded: 'Тариф' },
      { cashAssignment: 'Наложенный платеж' },
      { services: 'Услуги' },
      { serviceClientPriceTaxIncludedTotal: 'Стоимость услуг' },
      { totalPrice: 'Итого к оплате' },
    ];

  } else if (type == 'carrier') {
    header = [
      { counter: '№' },
      { createdAt: 'Дата заказа' },
      { refNo: 'Реф No.' },
      { addressFrom: 'Отправитель' },
      { addressTo: 'Получатель' },
      { tracking: 'Трекинг' },
      { orderStatus: 'Статус заказа' },
      { rateType: 'Тип тарифа' },
      { packageType: 'Тип посылки' },
      { packages: 'Пакеты' },
      { physicalWeight: 'Физический вес, kg' },
      { volumeWeight: 'Объемный вес, kg' },
      { declaredValue: 'Стоимость вложения' },
      { insurance: 'Страхование' },
      { cashAssignment: 'Наложенный платеж' },
      { servicesCompany: 'Услуги' },
      { serviceCompanyPriceTaxIncludedTotal: 'Стоимость услуг' },
      { companyPriceTaxIncluded: 'Стоимость перевозки' },
      { totalCompanyPrice: 'Итого к оплате' },
    ];

  } else if (type == 'accountant') {
    header = [
      { counter: '№' },
      { companyName: 'Компания клиента' },
      { userEmail: 'Логин клиента' },
      { userBIN: 'БИН' },
      { hasVATTotalPrice: 'Сумма за интервал с НДС' },
      { hasNoVATTotalPrice: 'Сумма за интервал без НДС' },
      { totalPrice: 'К оплате' },
    ];
  } else if (type == 'sales') {
    header = [
      { counter: '№' },
      { createdAt: 'Дата заказа' },
      { refNo: 'Реф No.' },
      { userEmail: 'Логин клиента' },
      { company: 'Компания' },
      { companyName: 'Организация' },
      { carrier: 'Перевозчик' },
      { packageType: 'Тип посылки' },
      { rateType: 'Тип тарифа' },
      { packages: 'Пакеты' },
      { cityFrom: 'Город отправителя' },
      { cityTo: 'Город получателя' },
      { income: 'Прибыль на доставке' },
      { sellerEmail: 'Продажник' },
      { sellerPercent: '% вознаграждения' },
      { sellerAward: 'Сумма вознаграждения' },
    ];
  } else if (type == 'sales_summary') {
    header = [
      { counter: '№' },
      { userEmail: 'Логин клиента' },
      { company: 'Компания' },
      { companyName: 'Организация' },
      { income: 'Прибыль на доставке' },
      { sellerEmail: 'Продажник' },
      { sellerExpiryDate: 'Дата истечения привязки' },
      { sellerPercent: '% вознаграждения' },
      { sellerAward: 'Сумма вознаграждения' },
    ];
  }

  //console.log(header);


  let records = [];
  let counter = 0;

  for (let row of rows) {
    counter++;
    console.log(row.Carrier.dataValues.isVATIncluded);
    console.log(row.Carrier.dataValues.isRateByCarrierApi);
    
    let rateParams = row.Carrier.RateParams[0];

    row.Packages.map((package) => {
      package.calcWeight = Math.max(package.weight, package.volumeWeight);
      return package;
    });

    let clientPriceTaxIncluded  = round(row.clientPrice)  + round(row.insurance) + round(row.taxVAT);
    let companyPriceTaxIncluded = round(row.companyPrice) + round(row.fuelTax) + round(row.insurance) + round((row.companyPrice + round(row.fuelTax)) * (row.percentVAT / 100));

    if(row.Carrier.dataValues.isRateByCarrierApi && row.Carrier.dataValues.isVATIncluded) {
      clientPriceTaxIncluded = round(row.clientPrice);
      companyPriceTaxIncluded = round(row.companyPrice);
    }

    let income = round(clientPriceTaxIncluded - companyPriceTaxIncluded);
    let margin = _round(income / (clientPriceTaxIncluded / 100), 2);

    let servicesCalcResults = {};
    let servicesCalcTotalResults = {
      'serviceClientPriceTaxIncludedTotal': 0,
      'serviceCompanyPriceTaxIncludedTotal': 0,
      'serviceIncomeTotal': 0,
    };

    serviceCodes.forEach((serviceCode) => {
      servicesCalcResults['serviceClientPriceTaxIncluded_' + serviceCode] = (round(row.OrderServices.filter((n) => n.code == serviceCode).reduce((a, v) => a + round(round(v.clientPrice) * v.quantity), 0)) || 0);
      servicesCalcResults['serviceCompanyPriceTaxIncluded_' + serviceCode] = (round(row.OrderServices.filter((n) => n.code == serviceCode).reduce((a, v) => a + round((round(v.companyPrice) + round(v.companyPrice * (row.percentVAT / 100))) * v.quantity), 0)) || 0);
      servicesCalcResults['serviceIncome_' + serviceCode] = round(servicesCalcResults['serviceClientPriceTaxIncluded_' + serviceCode] - servicesCalcResults['serviceCompanyPriceTaxIncluded_' + serviceCode]);
      servicesCalcTotalResults['serviceClientPriceTaxIncludedTotal'] += servicesCalcResults['serviceClientPriceTaxIncluded_' + serviceCode];
      servicesCalcTotalResults['serviceCompanyPriceTaxIncludedTotal'] += servicesCalcResults['serviceCompanyPriceTaxIncluded_' + serviceCode];
      servicesCalcTotalResults['serviceIncomeTotal'] += servicesCalcResults['serviceIncome_' + serviceCode];
    });

    let totalCompanyPrice = round(companyPriceTaxIncluded) + round(servicesCalcTotalResults['serviceCompanyPriceTaxIncludedTotal']);


    let record = {
      counter,
      id: row.id,
      createdAt: moment(row.createdAt).toDate(),
      refNo: row.refNo,
      company: row.User.Company.name['ru'],
      userEmail: row.User.email,
      userBIN: row.User.businessIDNumber,
      companyName: row.User.isCompany ? row.User.companyName : 'Частное лицо',
      addressFrom: row.addressFrom,
      addressTo: row.addressTo,
      carrier: row.Carrier.name['ru'],
      packageType: _('package.types.' + row.PackageType.type),
      rateType: _('rate.types.' + row.RateType.type),
      tracking: row.tracking,
      packages: row.Packages.map((p) => `${p.quantity} x ${p.weight}kg ${p.width} x ${p.height} x ${p.depth}cm`).join(' / '),
      services: row.OrderServices.map((s) => `${s.quantity} x ${s.name['ru']} - ${s.clientPrice}`).join(' / '),
      servicesCompany: row.OrderServices.map((s) => `${s.quantity} x ${s.name['ru']} - ` + (round((round(s.companyPrice) + round(s.companyPrice * (row.percentVAT / 100))) * s.quantity))).join(' / '),
      physicalWeight: _round(parseFloat(row.Packages.map((p) => p.weight).reduce((a, v) => a + v, 0)), 3),
      volumeWeight: _round(parseFloat(row.Packages.map((p) => p.volumeWeight).reduce((a, v) => a + v, 0)), 3),
      calcWeight: _round(parseFloat(row.Packages.map((p) => p.calcWeight).reduce((a, v) => a + v, 0)), 3),
      countryCodeFrom: row.countryCodeFrom,
      cityFrom: row.addressDetailsFrom.city,
      countryCodeTo: row.countryCodeTo,
      cityTo: row.addressDetailsTo.city,
      orderStatus: _('orders.orderStatuses.' + row.orderStatus),
      paymentStatus: _('orders.paymentStatuses.' + row.paymentStatus),
      clientPriceTaxIncluded,
      companyPriceTaxIncluded,
      clientDiscount: _round(row.clientDiscount, 2),
      income,
      margin,
      contents: row.contents,
      insurance: round(row.insurance),
      declaredValue: round(row.declaredValue),
      cashAssignment: row.OrderServices.find((s) => s.code == 'cash_assignment') ? round(row.declaredValue) : 0,
      hasVATTotalPrice: (row.percentVAT > 0) ? round(row.totalPrice) : 0,
      hasNoVATTotalPrice: (row.percentVAT == 0) ? round(row.totalPrice) : 0,

      ...servicesCalcResults,
      ...servicesCalcTotalResults,

      totalCompanyPrice: round(totalCompanyPrice),
      totalPrice: round(row.totalPrice),
    };
    
    if (type == 'sales' || type == 'sales_summary') {
      let companySales = row.User.Company.SalesUsers.filter((n) => moment(row.createdAt).isBetween(moment(n.createdAt), moment(n.expiryDate)));
      let userSales = row.User.SalesUsers.filter((n) => moment(row.createdAt).isBetween(moment(n.createdAt), moment(n.expiryDate)));
      
      //console.log('companySales', JSON.stringify(companySales));
      //console.log('userSales', JSON.stringify(userSales));
    
      if (companySales.length == 0 && userSales.length == 0) continue; // skipping this record
      if (where.SellerUserId) {
        if (
          (
            (companySales.findIndex((n) => n.UserId == where.SellerUserId) == -1) &&
            (userSales.findIndex((n) => n.UserId == where.SellerUserId) == -1)
          ) || 
          (
            (companySales.findIndex((n) => n.UserId == where.SellerUserId) > -1) &&
            (userSales.length > 0)
          )
        ) continue; // skipping this record
      }
      
      let seller = userSales.length > 0 ? userSales[0] : companySales[0];
      record.sellerEmail      = seller.User.email;
      record.sellerExpiryDate = moment(seller.expiryDate).toDate(),
      record.sellerPercent    = seller.percent;
      record.sellerAward      = round(income * (seller.percent / 100));
    }
    
    //console.log(record);
    records.push(record);
  }

  if (type == 'accountant') {
    records = records.map((record) => ({
      id: record.id,
      companyName: record.companyName,
      userEmail: record.userEmail,
      userBIN: record.userBIN,
      hasVATTotalPrice: record.hasVATTotalPrice,
      hasNoVATTotalPrice: record.hasNoVATTotalPrice,
    }));

    //records = Z.groupBy(d => d.userEmail, records);
    records = _groupBy(records, d => d.userEmail);

    //await fsWriteFileAsync('/tmp/records.json', JSON.stringify(records));

    let counter = 0;
    let newRecords = [];
    for (let key in records) {
      let record = records[key];
      //console.log(record);
      counter++;

      let hasVATTotalPrice = round(record.reduce((a, v) => a + v.hasVATTotalPrice, 0));
      let hasNoVATTotalPrice = round(record.reduce((a, v) => a + v.hasNoVATTotalPrice, 0));
      let totalPrice = round(hasVATTotalPrice + hasNoVATTotalPrice);

      newRecords.push({
        counter,
        companyName: record[0].companyName,
        userEmail: record[0].userEmail,
        userBIN: record[0].userBIN,
        hasVATTotalPrice,
        hasNoVATTotalPrice,
        totalPrice,
      });
    }
    records = newRecords;
  }
  if (type == 'sales_summary') {
    records = records.map((record) => ({
      id: record.id,
      userEmail: record.userEmail,
      company: record.company,
      companyName: record.companyName,
      income: record.income,
      sellerEmail: record.sellerEmail,
      sellerExpiryDate: record.sellerExpiryDate,
      sellerPercent: record.sellerPercent,
      sellerAward: record.sellerAward,
    }));

    //records = Z.groupBy(d => d.userEmail, records);
    records = _groupBy(records, d => d.userEmail);

    //await fsWriteFileAsync('/tmp/records.json', JSON.stringify(records));

    let newRecords = [];
    for (let key in records) {
      let record = records[key];
      //console.log(record);

      let income = round(record.reduce((a, v) => a + v.income, 0));
      let sellerAward  = round(record.reduce((a, v) => a + v.sellerAward, 0));

      newRecords.push({
        userEmail: record[0].userEmail,
        company: record[0].company,
        companyName: record[0].companyName,
        income,
        sellerEmail: record[0].sellerEmail,
        sellerExpiryDate: record[0].sellerExpiryDate,
        sellerPercent: record[0].sellerPercent,
        sellerAward,
      });
    }

    newRecords = _sortBy(newRecords, ['sellerEmail', 'userEmail']);
    
    let counter = 0;
    newRecords = newRecords.map((n) => {
      counter++;
      return { ...n, counter };
    });
    
    records = newRecords;
  }

  let data = {
    sheets: [
      {
        header,
        items: records,
        sheetName: 'sheet1',
      },
    ],
    filepath: reportFilePath,
  };

  jexcel.writeXlsx(data, function (err) {
    if (err) throw err;
    if (downloadToken) res.cookie(downloadToken, '1');

    res.download(reportFilePath, reportFileName, async function (err) {
      if (err) {
        next(err);
      } else {
        //console.log('Sent:', reportFilePath);
        await fsDeleteFileAsync(reportFilePath);
      }
    });
  });
}));

module.exports = router;
