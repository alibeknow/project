const { Order, OrderStatusHistory, OrderPaymentStatusHistory, Package, OrderService, OrderAPILog, User, Carrier, Address, Region, RegionRule, Country, PackageType, Zone, Rate, RateType, RateRange, RateParam, Group, AdditionalService, Sequelize, sequelize } = require('../models');

const ratesLib = require('../libs/rates');
const configLib = require('../libs/config');

const config = require('../config/app');

const moment = require('moment-timezone');
moment.tz.setDefault(config.timezone);

const { v4: uuid_v4 } = require('uuid');
const dataUriToBuffer = require('data-uri-to-buffer');

const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');

const AlemTatAPI = require('../libs/api/alemtat');
const MeaSoftAPI = require('../libs/api/measoft');
const CseAPI = require('../libs/api/cse');
const GpsAPI = require('../libs/api/gps');
const AramexAPI = require('../libs/api/aramex');


function msleep(n) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
}
function sleep(n) {
  msleep(n*1000);
}


const doOrderPlace = async () => {
  console.log('API daemon: doOrderPlace()');

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
    let api = order.Carrier.api;
    console.log('API daemon: doOrderPlace(): Processing order, API=' + api + ' ID=' + order.id);

    if (api == 'alemtat') {
      let apiAlemTat;

      try {
        apiAlemTat = new AlemTatAPI({
          apiKey: config.alemtat.apiKey,
          card: config.alemtat.card,
          senderName: config.alemtat.senderName,
          test: config.alemtat.test,
        });

        const ret = await apiAlemTat.createOrder(order);
        //console.log(ret);
        const waybill = await apiAlemTat.getWaybill(ret.WayBill.WayBillDocumentId);
        //console.log(waybill);

        order.orderStatus = 'confirmed';
        order.tracking = ret.WayBill.WayBillNumber;
        order.updatedById = 1;

        if (!Array.isArray(order.attachments)) order.attachments = [];

        const dataUri = 'data:application/pdf;base64,' + waybill.ReportData;

        order.attachments.push({
          id: uuid_v4(),
          name: 'waybill.pdf',
          lastModified: moment().toDate().getTime(),
          lastModifiedDate: moment(),
          size: String(dataUriToBuffer(dataUri)).length,
          type: 'application/pdf',
          data: dataUri,
        });
      } catch (e) {
        console.error('AlemTatAPI Error:', e);
        order.orderStatus = 'declined';

        await OrderAPILog.create({
          OrderId: order.id,
          type: 'error_create_order',
          data: {
            error: createJSONError(e),
            requestsLog: await apiAlemTat.getRequestsLog(),
          },
        });
      }

      await order.save();
    } else if (api == 'measoft') {
      let apiMeaSoft;

      try {
        apiMeaSoft = new MeaSoftAPI({ login: config.measoft.login, password: config.measoft.password, extracode: config.measoft.extracode });
        const ret = await apiMeaSoft.createOrder(order);
        //console.log(JSON.stringify(ret));

        if (ret.neworder.createorder._attributes.errormsg != 'success') throw Error('Error');

        order.orderStatus = 'confirmed';
        order.tracking = ret.neworder.createorder._attributes.barcode;
        order.updatedById = 1;

        const waybill = await apiMeaSoft.getWaybill(order.refNo);
        //console.log(waybill.waybill.content);

        if (!Array.isArray(order.attachments)) order.attachments = [];

        const dataUri = 'data:application/pdf;base64,' + waybill.waybill.content._text;

        order.attachments.push({
          id: uuid_v4(),
          name: 'waybill.pdf',
          lastModified: moment().toDate().getTime(),
          lastModifiedDate: moment(),
          size: String(dataUriToBuffer(dataUri)).length,
          type: 'application/pdf',
          data: dataUri,
        });
      } catch (e) {
        console.error('MeaSoftAPI Error:', e);
        order.orderStatus = 'declined';

        await OrderAPILog.create({
          OrderId: order.id,
          type: 'error_create_order',
          data: {
            error: createJSONError(e),
            requestsLog: await apiMeaSoft.getRequestsLog(),
          },
        });
      }

      await order.save();
    } else if (api == 'cse') {
      let apiCse;

      try {
        apiCse = new CseAPI({ login: config.cse.login, password: config.cse.password, test: config.cse.test });

        const ret = await apiCse.createOrder(order);
        //console.log('ret:', JSON.stringify(ret));

        order.orderStatus = 'confirmed';
        order.tracking = ret.documentNumber;
        order.updatedById = 1;

        const waybill = await apiCse.getWaybill(ret.waybillNumber);
        //console.log('waybill:', JSON.stringify(waybill));

        if (!Array.isArray(order.attachments)) order.attachments = [];

        const dataUri = 'data:application/pdf;base64,' + waybill['soap:Envelope']['soap:Body']['m:GetFormsForDocumentsResponse']['m:return']['m:List']['m:BData']['_text'];

        order.attachments.push({
          id: uuid_v4(),
          name: 'waybill.pdf',
          lastModified: moment().toDate().getTime(),
          lastModifiedDate: moment(),
          size: String(dataUriToBuffer(dataUri)).length,
          type: 'application/pdf',
          data: dataUri,
        });
      } catch (e) {
        console.error('CseAPI Error:', e);
        order.orderStatus = 'declined';

        await OrderAPILog.create({
          OrderId: order.id,
          type: 'error_create_order',
          data: {
            error: createJSONError(e),
            requestsLog: await apiCse.getRequestsLog(),
          },
        });
      }

      await order.save();
    } else if (api == 'gps') {
      let apiGps;

      try {
        apiGps = new GpsAPI({
          auth_token: config.gps.auth_token,
          user_id: config.gps.user_id,
          organization_id: config.gps.organization_id,
        });

        const ret = await apiGps.createOrder(order);
        //console.log('ret:', JSON.stringify(ret));

        order.orderStatus = 'confirmed';
        order.tracking = ret.code;
        order.updatedById = 1;

        const waybill = await apiGps.getWaybill(ret.id);
        //console.log('waybill:', JSON.stringify(waybill));

        if (!Array.isArray(order.attachments)) order.attachments = [];

        const dataUri = 'data:application/pdf;base64,' + waybill;

        order.attachments.push({
          id: uuid_v4(),
          name: 'waybill.pdf',
          lastModified: moment().toDate().getTime(),
          lastModifiedDate: moment(),
          size: String(dataUriToBuffer(dataUri)).length,
          type: 'application/pdf',
          data: dataUri,
        });
      } catch (e) {
        console.error('GpsAPI Error:', e);
        order.orderStatus = 'declined';

        await OrderAPILog.create({
          OrderId: order.id,
          type: 'error_create_order',
          data: {
            error: createJSONError(e),
            requestsLog: await apiGps.getRequestsLog(),
          },
        });
      }

      await order.save();
    } else if (api == 'aramex') {
      let apiAramex;

      try {
        apiAramex = new AramexAPI({
          clientInfo: config.aramex.clientInfo,
          test: config.aramex.test,
        });

        const ret = await apiAramex.createOrder(order);
        if (ret.shipments.HasErrors || ret.pickup.HasErrors) throw Error(JSON.stringify(ret));
        //console.log('ret:', JSON.stringify(ret));

        order.orderStatus = 'confirmed';
        order.tracking = ret['shipments']['Shipments']['ProcessedShipment'][0]['ID'];
        order.updatedById = 1;

        const waybill = await apiAramex.getWaybill(ret['shipments']['Shipments']['ProcessedShipment'][0]['ID']);
        if (waybill.HasErrors) throw Error(JSON.stringify(waybill));
        //console.log('waybill:', JSON.stringify(waybill));

        if (!Array.isArray(order.attachments)) order.attachments = [];

        const dataUri = 'data:application/pdf;base64,' + waybill['ShipmentLabel']['LabelFileContents'];

        order.attachments.push({
          id: uuid_v4(),
          name: 'waybill.pdf',
          lastModified: moment().toDate().getTime(),
          lastModifiedDate: moment(),
          size: String(dataUriToBuffer(dataUri)).length,
          type: 'application/pdf',
          data: dataUri,
        });
      } catch (e) {
        console.error('AramexAPI Error:', e);
        order.orderStatus = 'declined';

        await OrderAPILog.create({
          OrderId: order.id,
          type: 'error_create_order',
          data: {
            error: createJSONError(e),
            requestsLog: await apiAramex.getRequestsLog(),
          },
        });
      }

      await order.save();
    }
  }
};

const doOrderTrack = async () => {
  console.log('API daemon: doOrderTrack()');

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
    let api = order.Carrier.api;
    console.log('API daemon: doOrderTrack(): Processing order, API=' + api + ' ID=' + order.id);

    if (api == 'alemtat') {
      let apiAlemTat;

      try {
        apiAlemTat = new AlemTatAPI({
          apiKey: config.alemtat.apiKey,
          card: config.alemtat.card,
          senderName: config.alemtat.senderName,
          test: config.alemtat.test,
        });

        const ret = await apiAlemTat.getDeliveryStatus(order.tracking);
        //console.log(JSON.stringify(ret));

        if (ret && Array.isArray(ret['Shipments']) && ret['Shipments'].length > 0 && Array.isArray(ret['Shipments'][0]['Events']) && ret['Shipments'][0]['Events'].length > 0) {
          let status = ret['Shipments'][0]['Events'][0]['Comment'];
          console.log('status:', JSON.stringify(status));

          if (['НЕ ДОСТАВЛЕНО'].indexOf(status) > -1) {
            //order.orderStatus = 'confirmed'; // needs to be commented to keep in translit when not delivered into hands
          } else if (['УСПЕШНО ДОСТАВЛЕН', 'ДОСТАВЛЕНО ПОВРЕЖДЕННЫМ'].indexOf(status) > -1) {
            order.orderStatus = 'delivered';
          } else if (['ОТПРАВКА УНИЧТОЖЕНА', 'ОТКАЗ В ПОЛУЧЕНИИ'].indexOf(status) > -1) {
            order.orderStatus = 'attention';
          } else if ([
            'ИЗЪЯТО ЗА ИСТЕЧЕНИЕМ СРОКА ХРАНЕНИЯ',
            'ОТКАЗ БРОНИРОВАНИЯ ЯЧЕЙКИ ПОСТАМАТА',
            'КОМПАНИЯ ПЕРЕЕХАЛА',
            'НЕВЕРНЫЙ АДРЕС',
            'УТЕРЯ',
            'НЕВЕРНАЯ СОРТИРОВКА',
            'ДВИЖЕНИЕ ПРИОСТАНОВЛЕНО',
            'ПОДЛЕЖИТ ИЗЪЯТИЮ ЗА ИСТЕЧЕНИЕМ СРОКА ХРАНЕНИЯ',
            'ОТПРАВКА ПОВРЕЖДЕНА',
            'ОТКАЗ В ПОЛУЧЕНИИ',
            'ИЗМЕНЕНИЕ АДРЕСА ДОСТАВКИ',
            'ВОЗВРАТ ОТПРАВИТЕЛЮ',
          ].indexOf(status) > -1) {
            order.orderStatus = 'attention';
          } else {
            order.orderStatus = 'in_transit';
          }

          order.updatedById = 1;
        }
      } catch (e) {
        console.error('AlemTatAPI Error:', e);

        await OrderAPILog.create({
          OrderId: order.id,
          type: 'error_track_order',
          data: {
            error: createJSONError(e),
            requestsLog: await apiAlemTat.getRequestsLog(),
          },
        });
      }

      await order.save();
    } else if (api == 'measoft') {
      let apiMeaSoft;

      try {
        apiMeaSoft = new MeaSoftAPI({ login: config.measoft.login, password: config.measoft.password, extracode: config.measoft.extracode });

        const ret = await apiMeaSoft.getDeliveryStatus(order.refNo);
        if (ret.statusreq._attributes.count != 1) throw Error('statusreq count is wrong.');
        //console.log(JSON.stringify(ret.statusreq.order.status));
        //{"_attributes":{"eventstore":"Web-службы","eventtime":"2020-08-28 12:43:19","createtimegmt":"2020-08-28 12:43:19","message":"","title":"Новый"},"_text":"NEW"}

        if (['AWAITING_SYNC', 'NEW'].indexOf(ret.statusreq.order.status._text) > -1) {
          order.orderStatus = 'confirmed';
        } else if (['COMPLETE'].indexOf(ret.statusreq.order.status._text) > -1) {
          order.orderStatus = 'delivered';
        } else if (['CANCELED'].indexOf(ret.statusreq.order.status._text) > -1) {
          order.orderStatus = 'canceled';
        } else if (['COURIERRETURN', 'COURIERCANCELED', 'RETURNING', 'LOST', 'RETURNED'].indexOf(ret.statusreq.order.status._text) > -1) {
          order.orderStatus = 'attention';
        } else {
          order.orderStatus = 'in_transit';
        }

        order.updatedById = 1;
      } catch (e) {
        console.error('MeaSoftAPI Error:', e);

        await OrderAPILog.create({
          OrderId: order.id,
          type: 'error_track_order',
          data: {
            error: createJSONError(e),
            requestsLog: await apiMeaSoft.getRequestsLog(),
          },
        });
      }

      await order.save();
    } else if (api == 'cse') {
      let apiCse;

      try {
        apiCse = new CseAPI({ login: config.cse.login, password: config.cse.password, test: config.cse.test });
        const ret = await apiCse.getDeliveryStatus(order.tracking);
        //console.log('ret:', JSON.stringify(ret));
        let orderHistory = ret['soap:Envelope']['soap:Body']['m:TrackingResponse']['m:return']['m:List']
        let lastStatus;
        if (Array.isArray(orderHistory)) {
          lastStatus = orderHistory.find((w) => w['m:Key']['_text'].trim() == order.tracking)['m:List'];
        } else {
          lastStatus = orderHistory['m:List'];
        }
        if (Array.isArray(lastStatus)) lastStatus = lastStatus.pop();

        if (lastStatus) {
          let lastStatusId = lastStatus['m:Properties'].find((n) => n['m:Key']['_text'] == 'GUID')['m:Value']['_text'];
          console.log('lastStatusId:', JSON.stringify(lastStatusId));

          if (lastStatusId) {
            let status = [
              {
                key: '052bdc4e-02b2-4209-b2ab-1e856d330ef5',
                text: 'Заказ выполнен.',
                status: 'delivered'
              },
              {
                key: '8c9ab389-4ef8-4d6c-99d4-c0bb2c62a623',
                text: 'Груз забран',
                status: 'in_transit'
              },
              {
                key: 'c46daf14-0ae8-4881-a7ad-152a05f59227',
                text: 'Груз получен курьером',
                status: 'in_transit'
              },
              {
                key: '73fb7129-f4f6-11e4-a887-001e67086478',
                text: 'Заказ подтвержден клиентом',
                status: 'confirmed'
              },
              //{
              //  key: 'c67e692c-6d2a-4be4-a15b-6c12fc4307df',
              //  text: 'Заказ проверяется.',
              //  status: 'in_transit'
              //},
              {
                key: 'd6031139-b443-11e8-80c1-7cd30aec6901',
                text: 'Изменение параметров приёма отправления',
                status: 'attention'
              },
              {
                key: '4a39268e-d5a9-44b1-9255-3296d48df57f',
                text: 'Курьер отправлен.',
                status: 'confirmed'
              },
              {
                key: '6d63f79d-28ca-11e5-86ab-001e67086478',
                text: 'На утверждении клиента',
                status: 'attention'
              },
              {
                key: '6f2c0759-4b35-40d2-ae35-7e72cc43f267',
                text: 'Назначен курьер',
                status: 'confirmed'
              },
              {
                key: '6c7f342b-6949-4cc3-9992-8daf98e2084c',
                text: 'Заказ отменён',
                status: 'canceled'
              },
              {
                key: '41dafeb5-64a7-4b38-8be7-c42fa5963add',
                text: 'Заказ отменён клиентом',
                status: 'canceled'
              },
              {
                key: 'b7a84166-3233-4844-a0af-06761f65ffdd',
                text: 'На основании заказа оформлена накладная.',
                status: 'confirmed'
              },
              {
                key: '0bcffda3-d0ca-4104-bc58-fbd374f325cd',
                text: 'Заказ принят. Идет обработка заказа.',
                status: 'confirmed'
              },
              //{
              //  key: '1a5a1c1e-1d09-11e5-8b42-001e67086478',
              //  text: 'Оформлена расходная накладная',
              //  status: 'in_transit'
              //},
              //{
              //  key: '562d153e-252f-496a-a630-5f1541903b91',
              //  text: 'Складская операция выполняется...',
              //  status: 'in_transit'
              //},
              //{
              //  key: 'd06dff35-8262-42f7-995c-ee72d28897e7',
              //  text: 'Складская операция завершена.',
              //  status: 'in_transit'
              //},
              {
                key: 'fc30378d-a132-11e7-875d-001e67086478',
                text: 'Внимание! Информация по доставке',
                status: 'attention'
              },
              {
                key: '44133e83-0fb3-4338-9ddd-461e2e565c1a',
                text: 'Заказ утвержден.',
                status: 'confirmed'
              }
            ].find((n) => n['key'] == lastStatusId);
            //console.log('status:', status);

            if (status) {
              order.orderStatus = status['status'];
              order.updatedById = 1;
            }
          }
        }
      } catch (e) {
        console.error('Error:', e);

        await OrderAPILog.create({
          OrderId: order.id,
          type: 'error_track_order',
          data: {
            error: createJSONError(e),
            requestsLog: await apiCse.getRequestsLog(),
          },
        });
      }

      await order.save();
    } else if (api == 'gps') {
      let apiGps;

      try {
        apiGps = new GpsAPI({
          auth_token: config.gps.auth_token,
          user_id: config.gps.user_id,
          organization_id: config.gps.organization_id,
        });

        const ret = await apiGps.getDeliveryStatus(order.tracking);
        //console.log('ret:', JSON.stringify(ret));

        if (!ret.error) {
          if (Array.isArray(ret.waybill.deliveries) && ret.waybill.deliveries.length > 0) {
            let status = ret.waybill.deliveries[0].code;
            console.log('status: ', status);

            /*
            1 Успешная доставка OK Успешная доставка курьером
            2 Успешная доставка FO Успешная доставка (самовывоз)
            3 Неудачная попытка BA Неточный адрес
            4 Неудачная попытка SR Отказ от получения
            5 Неудачная попытка NR Отсутствие получателя
            6 Неудачная попытка LS Перерегистрация
            7 Неудачная попытка PL Временная утеря / пропажа инициализируются служебное расследование
            8 Неудачная попытка RS Возврат отправителю
            9 Неудачная попытка AL Адресат выбыл
            10 Неудачная попытка SA Отказ (Адресат сообщил, что заберет самовывозом)
            11 Неудачная попытка NP Нет оплаты при оплате получателем
            12 Неудачная попытка NT Отсутствие времени поломка авто / форс-мажор. Отправление будет приоритетным в доставке на следующий день.
            13 Неудачная попытка DL Отложена доставка по просьбе клиента
            14 Неудачная попытка DT Дебиторская задолженность заказчика
            15 Неудачная попытка CR Отказ от оплаты наложенного платежа
            16 Возврат RE Успешный возврат
            */

            if (['OK', 'FO'].indexOf(status) > -1) {
              order.orderStatus = 'delivered';
            } else if (['RS', 'RE'].indexOf(status) > -1) {
              order.orderStatus = 'returned';
            } else {
              order.orderStatus = 'attention';
            }
          } else {
            order.orderStatus = 'in_transit';
          }

          order.updatedById = 1;
        }
      } catch (e) {
        console.error('GpsAPI Error:', e);

        await OrderAPILog.create({
          OrderId: order.id,
          type: 'error_track_order',
          data: {
            error: createJSONError(e),
            requestsLog: await apiGps.getRequestsLog(),
          },
        });
      }

      await order.save();
    } else if (api == 'aramex') {
      let apiAramex;

      try {
        apiAramex = new AramexAPI({
          clientInfo: config.aramex.clientInfo,
          test: config.aramex.test,
        });

        const ret = await apiAramex.getDeliveryStatus(order.tracking);
        //console.log('ret:', JSON.stringify(ret));

        if (ret.HasErrors) throw Error(JSON.stringify(ret));

        if (!ret.HasErrors && ret.TrackingResults) {
          let status = ret['TrackingResults']['KeyValueOfstringArrayOfTrackingResultmFAkxlpY'][0]['Value']['TrackingResult'][0]['UpdateCode'];
          console.log('status:', status);

          // SH014 - Record created.
          // SH308 - Pickup Scheduled
          // SH012 - Picked Up From Shipper
          // SH005 - Delivered

          if (['SH005'].indexOf(status) > -1) {
            order.orderStatus = 'delivered';
          } else if (['SH014', 'SH308'].indexOf(status) > -1) {
            order.orderStatus = 'confirmed';
          } else {
            order.orderStatus = 'in_transit';
          }

          order.updatedById = 1;
        }
      } catch (e) {
        console.error('AramexAPI Error:', e);

        await OrderAPILog.create({
          OrderId: order.id,
          type: 'error_track_order',
          data: {
            error: createJSONError(e),
            requestsLog: await apiAramex.getRequestsLog(),
          },
        });
      }

      await order.save();
    }
  }

  const doOrderTrackFinishTime = moment();

  console.log('API daemon: doOrderTrack(): Done! Start Time =', doOrderTrackStartTime.format('YYYY-MM-DD HH:mm:ss'), '/', 'Finish Time =', doOrderTrackFinishTime.format('YYYY-MM-DD HH:mm:ss'));
};

const run = async () => {
  if (!config.apiDaemon.active) return;

  console.log('API daemon: run()');

  const doOrderPlaceCall = () => {
    setTimeout((async () => {
      try {
        await doOrderPlace();
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
        await doOrderTrack();
      } catch (e) {
        console.error(e);
      }
      doOrderTrackCall();
    }), config.apiDaemon.doOrderTrackTimeout || 60000);
  }
  doOrderTrackCall();
}

module.exports.run = run;
