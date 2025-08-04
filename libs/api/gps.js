const config = require('../../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

const fetch = require('isomorphic-unfetch');


class GpsAPI {
  constructor(args = {}) {
    // auth_token=98ec5f1700a16ae9050726afed605f11&user_id=237&organization_id=48
    const { auth_token = '', user_id = '', organization_id = '', payer = '' } = args;

    this.auth_token      = auth_token;
    this.user_id         = user_id;
    this.organization_id = organization_id;
    this.payer           = payer;

    this.requestsLog = [];
  }

  async create(order) {
    const ret = await this.createOrder(order);
    //console.log('ret:', JSON.stringify(ret));

    let id = ret.code;

    const waybill = await this.getWaybill(ret.id);
    //console.log('waybill:', JSON.stringify(waybill));

    const data = waybill;
    
    return {
      id,
      waybill: data,
    };
  }

  async track(id) {
    let orderStatus = null;
    let status = null;

    const ret = await this.getDeliveryStatus(id);
    //console.log('ret:', JSON.stringify(ret));

    if (!ret.error) {
      if (Array.isArray(ret.waybill.deliveries) && ret.waybill.deliveries.length > 0) {
        status = ret.waybill.deliveries[0].code;
        // console.log('status: ', status);

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
          orderStatus = 'delivered';
        } else if (['RS', 'RE'].indexOf(status) > -1) {
          orderStatus = 'returned';
        } else {
          orderStatus = 'attention';
        }
      } else {
        orderStatus = 'in_transit';
      }
    }

    return {
      orderStatus,
      status,
    };
  }

  async _makeRequest(url, method = 'GET', body = {}, type = 'json', auth = true) {
    let options = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      }
    };
    if (method == 'POST') options.body = JSON.stringify(body);

    if (auth) {
      const auth = `auth_token=${this.auth_token}&user_id=${this.user_id}&organization_id=${this.organization_id}`;
      url += url.indexOf('?') === -1 ? '?' + auth : '&' + auth;
    }

    let res = await fetch(url, options);

    if (type == 'text') res = await res.text();
    if (type == 'json') res = await res.json();
    if (type == 'blob') res = await res.blob();

    this.requestsLog.push({
      date: new Date(),
      req: {
        url,
        opts: options,
      },
      res,
    });

    return res;
  }

  async getRequestsLog() {
    return this.requestsLog;
  }

  async createOrder(order) {
    let _package = '';
    let _service = '';

    if (order.PackageType.type == 'box') _package = 'package';
    if (order.PackageType.type == 'documents') _package = 'envelope';

    if (order.RateType.type == 'standard') _service = 'standart';
    if (order.RateType.type == 'economy') _service = 'standart';
    if (order.RateType.type == 'express') _service = 'express_standart';
    if (order.RateType.type == 'super_express') _service = 'express_12';

    let res = await this._makeRequest('http://cab.gpserv.kz/api/waybills', 'POST', {
      "waybill": {
          "sender_contact_person": order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName,
          "sender_name": order.addressDetailsFrom.companyName ? order.addressDetailsFrom.companyName : 'Частное лицо',
          "sender_city_title": order.addressDetailsFrom.city,
          "sender_address": order.addressDetailsFrom.addressLine1 + (order.addressDetailsFrom.addressLine2 ? ` ${order.addressDetailsFrom.addressLine2}`: ''),
          "sender_contact_phone": order.addressDetailsFrom.phone,
          "receiver_contact_person": order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName,
          "receiver_name": order.addressDetailsTo.companyName ? order.addressDetailsTo.companyName : 'Частное лицо',
          "receiver_city_title": order.addressDetailsTo.city,
          "receiver_address": order.addressDetailsTo.addressLine1 + (order.addressDetailsTo.addressLine2 ? ` ${order.addressDetailsTo.addressLine2}`: ''),
          "receiver_contact_phone": order.addressDetailsTo.phone,
          "placement_quantity": order.Packages.map((p) => p.quantity).reduce((a, v) => a + v, 0),
          "payer": 'third_party', // sender, receiver, third_party
          "payment_method": "bank",
          "service": _service,
          "type_of_package": _package,
      }
    });

    return res;
  }

  async getWaybill(id) {
    let res = await this._makeRequest('http://cab.gpserv.kz/api/waybills/' + id + '/print.pdf', 'GET', {}, 'blob');

    return Buffer.from(await res.arrayBuffer()).toString('base64');
  }

  async getDeliveryStatus(tracking) {
    let res = await this._makeRequest('http://api.gpserv.work/public/v1/tracking?waybill=' + tracking, 'GET', {}, 'json', false);

    return res;
  }

}

module.exports = GpsAPI;
