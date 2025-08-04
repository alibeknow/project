const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');

const { Order, OrderStatusHistory, OrderPaymentStatusHistory, Package, OrderService, PaymentNotification, User, Carrier, Address, Region, RegionRule, Country, PackageType, Zone, Rate, RateType, RateRange, RateParam, Group, AdditionalService, Sequelize, sequelize } = require('../models');

const { ClientService, ResponseCodes } = require('cloudpayments');
const config = require('../config/app');

const moment = require('moment-timezone');
moment.tz.setDefault(config.timezone);

function isValidJSON(str) {
  try {
    JSON.parse(str);
  } catch (e) {
    return false;
  }
  return true;
}


const client = new ClientService({
  privateKey: config.cloudpayments.privateKey,
  publicId:   config.cloudpayments.publicId,
});

const handlers = client.getNotificationHandlers();


router.post('/pay', asyncHandler(async (req, res, next) => {
  /*

  {
    TransactionId: '409196651',
    Amount: '10.00',
    Currency: 'RUB',
    PaymentAmount: '10.00',
    PaymentCurrency: 'RUB',
    OperationType: 'Payment',
    InvoiceId: '1234567',
    AccountId: '',
    SubscriptionId: '',
    Name: 'ZZ',
    Email: '',
    DateTime: '2020-06-23 12:14:24',
    IpAddress: '82.209.221.230',
    IpCountry: 'BY',
    IpCity: 'Могилёв',
    IpRegion: '',
    IpDistrict: 'Могилёвская область',
    IpLatitude: '53.9168',
    IpLongitude: '30.3449',
    CardFirstSix: '424242',
    CardLastFour: '4242',
    CardType: 'Visa',
    CardExpDate: '12/22',
    Issuer: 'CloudPayments',
    IssuerBankCountry: 'RU',
    Description: 'Пример оплаты (деньги сниматься не будут)',
    AuthCode: 'A1B2C3',
    Token: '477BBA133C182267FE5F086924ABDC5DB71F77BFC27F01F2843F2CDC69D89F05',
    TestMode: '1',
    Status: 'Authorized',
    GatewayName: 'Test',
    Data: '{"myProp":"myProp value"}',
    TotalFee: '0.00',
    CardProduct: 'I',
    PaymentMethod: ''
  }

  */

  const response = await handlers.handlePayRequest(req, async (request) => {
    //console.log(req.headers);
    //console.log(request);

    try {
      let orderId = null;

      if (isValidJSON(request.Data)) {
        let data = JSON.parse(request.Data);
        if (data.OrderId) orderId = data.OrderId;
      }

      await PaymentNotification.create({
        type: 'pay',
        paymentData: request,
        OrderId: orderId,
      });
    } catch (err) {
      console.error('PaymentNotification logging error: ', err);
    }

    request.Data = JSON.parse(request.Data);

    if (request.Data.OrderId) {
      const order = await Order.findOne({
        where: { id: request.Data.OrderId },
        include: [
          {
            model: User,
            as: 'User',
            attributes: {
              exclude: ['password', 'APIKey'],
            },
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

      order.orderStatus = 'processing';
      order.paymentStatus = 'authorized';
      order.updatedById = 1;
      await order.save();
    }

    return ResponseCodes.SUCCESS;
  });

  res.json(response.response);
}));

router.post('/fail', asyncHandler(async (req, res, next) => {
  /*

  {
    TransactionId: '409199732',
    Amount: '10.00',
    Currency: 'RUB',
    PaymentAmount: '10.00',
    PaymentCurrency: 'RUB',
    OperationType: 'Payment',
    InvoiceId: '1234567',
    AccountId: '',
    SubscriptionId: '',
    Name: 'FF',
    Email: '',
    DateTime: '2020-06-23 12:19:06',
    IpAddress: '82.209.221.230',
    IpCountry: 'BY',
    IpCity: 'Могилёв',
    IpRegion: '',
    IpDistrict: 'Могилёвская область',
    IpLatitude: '53.9168',
    IpLongitude: '30.3449',
    CardFirstSix: '510510',
    CardLastFour: '5100',
    CardType: 'MasterCard',
    CardExpDate: '12/22',
    Issuer: 'Tinkoff',
    IssuerBankCountry: 'RU',
    Description: 'Пример оплаты (деньги сниматься не будут)',
    TestMode: '1',
    Status: 'Declined',
    StatusCode: '5',
    Reason: 'InsufficientFunds',
    ReasonCode: '5051',
    PaymentMethod: '',
    Data: '{"myProp":"myProp value"}'
  }

  */

  const response = await handlers.handlePayRequest(req, async (request) => {
    //console.log(req.headers);
    //console.log(request);

    try {
      let orderId = null;

      if (isValidJSON(request.Data)) {
        let data = JSON.parse(request.Data);
        if (data.OrderId) orderId = data.OrderId;
      }

      await PaymentNotification.create({
        type: 'fail',
        paymentData: request,
        OrderId: orderId,
      });
    } catch (err) {
      console.error('PaymentNotification logging error: ', err);
    }

    request.Data = JSON.parse(request.Data);

    if (request.Data.OrderId) {
      const order = await Order.findOne({
        where: { id: request.Data.OrderId },
      });

      order.paymentStatus = 'failed';
      order.updatedById = 1;
      await order.save();
    }

    return ResponseCodes.SUCCESS;
  });

  res.json(response.response);
}));

router.post('/refund', asyncHandler(async (req, res, next) => {
  /*

  {
    TransactionId: '409198378',
    PaymentTransactionId: '409196651',
    Amount: '9.00',
    OperationType: 'Refund',
    InvoiceId: '1234567',
    AccountId: '',
    Email: '',
    DateTime: '2020-06-23 12:17:07',
    Data: '{"myProp":"myProp value"}'
  }

  */

  const response = await handlers.handlePayRequest(req, async (request) => {
    //console.log(req.headers);
    //console.log(request);

    try {
      let orderId = null;

      if (isValidJSON(request.Data)) {
        let data = JSON.parse(request.Data);
        if (data.OrderId) orderId = data.OrderId;
      }

      await PaymentNotification.create({
        type: 'refund',
        paymentData: request,
        OrderId: orderId,
      });
    } catch (err) {
      console.error('PaymentNotification logging error: ', err);
    }

    request.Data = JSON.parse(request.Data);
    
    if (request.Data.OrderId) {
      const order = await Order.findOne({
        where: { id: request.Data.OrderId },
      });

      order.paymentStatus = 'refunded';
      order.updatedById = 1;
      await order.save();
    }

    return ResponseCodes.SUCCESS;
  });

  res.json(response.response);
}));

router.post('/confirm', asyncHandler(async (req, res, next) => {
  /*

  {
    TransactionId: '409203878',
    Amount: '3.00',
    Currency: 'RUB',
    PaymentAmount: '3.00',
    PaymentCurrency: 'RUB',
    InvoiceId: '1234567',
    AccountId: '',
    SubscriptionId: '',
    Name: 'OO',
    Email: '',
    DateTime: '2020-06-23 12:25:45',
    IpAddress: '82.209.221.230',
    IpCountry: 'BY',
    IpCity: 'Могилёв',
    IpRegion: '',
    IpDistrict: 'Могилёвская область',
    IpLatitude: '53.9168',
    IpLongitude: '30.3449',
    CardFirstSix: '424242',
    CardLastFour: '4242',
    CardType: 'Visa',
    CardExpDate: '12/22',
    Issuer: 'CloudPayments',
    IssuerBankCountry: 'RU',
    Description: 'Пример оплаты (деньги сниматься не будут)',
    AuthCode: 'A1B2C3',
    Token: '477BBA133C182267FE5F086924ABDC5DB71F77BFC27F01F2843F2CDC69D89F05',
    TestMode: '1',
    Status: 'Completed',
    PaymentMethod: '',
    Data: '{"myProp":"myProp value"}'
  }

  */

  const response = await handlers.handlePayRequest(req, async (request) => {
    //console.log(req.headers);
    //console.log(request);

    try {
      let orderId = null;

      if (isValidJSON(request.Data)) {
        let data = JSON.parse(request.Data);
        if (data.OrderId) orderId = data.OrderId;
      }

      await PaymentNotification.create({
        type: 'confirm',
        paymentData: request,
        OrderId: orderId,
      });
    } catch (err) {
      console.error('PaymentNotification logging error: ', err);
    }

    request.Data = JSON.parse(request.Data);
    
    if (request.Data.OrderId) {
      const order = await Order.findOne({
        where: { id: request.Data.OrderId },
      });

      order.paymentStatus = 'confirmed';
      order.updatedById = 1;
      await order.save();
    }

    return ResponseCodes.SUCCESS;
  });

  res.json(response.response);
}));

router.post('/cancel', asyncHandler(async (req, res, next) => {
  /*

  {
    TransactionId: '409200580',
    Amount: '10.00',
    OperationType: 'Payment',
    InvoiceId: '1234567',
    AccountId: '',
    Email: '',
    DateTime: '2020-06-23 12:20:26',
    Data: '{"myProp":"myProp value"}'
  }

  */

  const response = await handlers.handlePayRequest(req, async (request) => {
    //console.log(req.headers);
    //console.log(request);

    try {
      let orderId = null;

      if (isValidJSON(request.Data)) {
        let data = JSON.parse(request.Data);
        if (data.OrderId) orderId = data.OrderId;
      }

      await PaymentNotification.create({
        type: 'cancel',
        paymentData: request,
        OrderId: orderId,
      });
    } catch (err) {
      console.error('PaymentNotification logging error: ', err);
    }

    request.Data = JSON.parse(request.Data);
    
    if (request.Data.OrderId) {
      const order = await Order.findOne({
        where: { id: request.Data.OrderId },
      });

      order.paymentStatus = 'canceled';
      order.updatedById = 1;
      await order.save();
    }

    return ResponseCodes.SUCCESS;
  });

  res.json(response.response);
}));

router.post('/pay_success', asyncHandler(async (req, res, next) => {
  // TODO: temp handler for paybox

  if (req.body.OrderId) {
    const order = await Order.findOne({
      where: { id: req.body.OrderId },
      include: [
        {
          model: User,
          as: 'User',
          attributes: {
            exclude: ['password', 'APIKey'],
          },
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

    order.orderStatus = 'processing';
    order.paymentStatus = 'authorized';
    order.updatedById = 1;
    await order.save();
  }

  res.json(true);
}));

module.exports = router;
