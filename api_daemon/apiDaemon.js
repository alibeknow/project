const { Order, OrderStatusHistory, OrderPaymentStatusHistory, Package, OrderService, OrderAPILog, User, Carrier, Address, Region, RegionRule, Country, PackageType, Zone, Rate, RateType, RateRange, RateParam, Group, AdditionalService, Sequelize, sequelize } = require('../models');

const config = require('../config/app');

const moment = require('moment-timezone');
moment.tz.setDefault(config.timezone)

const { v4: uuid_v4 } = require('uuid');
const dataUriToBuffer = require('data-uri-to-buffer');

const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');

const createAPI = require('../libs/api/factory');


function msleep(n) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
}
function sleep(n) {
  msleep(n*1000);
}


const doOrderPlace = async (api) => {
  console.log(`API daemon [${api}]: doOrderPlace()`);

  const orders = await Order.findAll({
    where: {
      orderStatus: 'processing',
    },
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
        required: true,
      },
      {
        model: Carrier,
        required: true,
        //attributes: { exclude: ['logo'] },
        where: {
          isActive: true,
          api,
        },
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

  for (let order of orders) {
    console.log(`API daemon [${api}]: doOrderPlace(): Processing order ID=${order.id}`);

    let apiClient;

    try {
      apiClient = createAPI(api);

      const ret = await apiClient.create(order);
      console.log('Order created, Tracking ID=' + ret.id);

      order.orderStatus = 'confirmed';
      order.tracking = ret.id;
      order.updatedById = 1;

      if (!Array.isArray(order.attachments)) order.attachments = [];

      if (ret.waybill != null) {
        const dataUri = 'data:application/pdf;base64,' + ret.waybill;

        order.attachments.push({
          id: uuid_v4(),
          name: 'waybill.pdf',
          lastModified: moment().toDate().getTime(),
          lastModifiedDate: moment(),
          size: String(dataUriToBuffer(dataUri)).length,
          type: 'application/pdf',
          data: dataUri,
        });
      }
      
      await OrderAPILog.create({
        OrderId: order.id,
        type: 'success_create_order',
        data: {
          error: null,
          requestsLog: await apiClient.getRequestsLog(),
        },
      });
    } catch (e) {
      console.error('API Error:', e);
      order.orderStatus = 'declined';

      await OrderAPILog.create({
        OrderId: order.id,
        type: 'error_create_order',
        data: {
          error: createJSONError(e),
          requestsLog: await apiClient.getRequestsLog(),
        },
      });
    }

    await order.save();
  } 
};

const doOrderTrack = async (api) => {
  console.log(`API daemon [${api}]: doOrderTrack()`);

  const doOrderTrackStartTime = moment();

  const orders = await Order.findAll({
    where: {
      orderStatus: {
        [Sequelize.Op.in]: ['confirmed', 'in_transit', /*'attention'*/],
      },
    },
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
        required: true,
      },
      {
        model: Carrier,
        required: true,
        //attributes: { exclude: ['logo'] },
        where: {
          isActive: true,
          api,
        },
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

  for (let order of orders) {
    console.log(`API daemon [${api}]: doOrderTrack(): Processing order ID=${order.id}`);
    
    let apiClient;

    try {
      apiClient = createAPI(api);
      
      const ret = await apiClient.track(order.tracking);
      console.log(ret);

      if (ret.orderStatus) {
        order.orderStatus = ret.orderStatus;
        order.updatedById = 1;
      }
      
    } catch (e) {
      console.error('API Error:', e);

      await OrderAPILog.create({
        OrderId: order.id,
        type: 'error_track_order',
        data: {
          error: createJSONError(e),
          requestsLog: await apiClient.getRequestsLog(),
        },
      });
    }

    await order.save();
  }

  const doOrderTrackFinishTime = moment();

  console.log('API daemon [' + api + ']: doOrderTrack(): Done! Start Time =', doOrderTrackStartTime.format('YYYY-MM-DD HH:mm:ss'), '/', 'Finish Time =', doOrderTrackFinishTime.format('YYYY-MM-DD HH:mm:ss'));
};

const run = async () => {
  const api = process.env.BS_API;

  if (!api) throw Error('BS_API env variable is not defined');

  console.log(`API daemon [${api}]: run()`);

  const doOrderPlaceCall = () => {
    setTimeout((async () => {
      try {
        await doOrderPlace(api);
      } catch (e) {
        console.error(e);
      }
      doOrderPlaceCall();
    }), config.apiDaemon.doOrderPlaceTimeout || 60000);
  }
  doOrderPlaceCall();

  const doOrderTrackCall = () => {
    setTimeout((async () => {
      try {
        await doOrderTrack(api);
      } catch (e) {
        console.error(e);
      }
      doOrderTrackCall();
    }), config.apiDaemon.doOrderTrackTimeout || 60000);
  }
  doOrderTrackCall();
}

module.exports.run = run;
