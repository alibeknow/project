const config = require('../../config/app');
const moment = require('moment-timezone');
const _round = require('lodash/round');

moment.tz.setDefault(config.timezone);

const fetch = require('isomorphic-unfetch');

function parse(data) {
  let arr = [];
  let idx = 0;

  for (let i = 0; i < data.length; i++) {
    if (data[i] == 10) {
      let buf = Buffer.allocUnsafe(i - idx + 1);
      data.copy(buf, 0, idx, i + 1);
      arr.push(buf);
      idx = i + 1;
    }
  }

  arr = arr.splice(4, arr.length - 5);
  return Buffer.concat(arr);
}


class SparkAPI {
  constructor(args = {}) {
    const {
      user,
      password,
      token = '681bfa8371dd455f8cde8d55a6c32cb3',
      test = true,
    } = args;
    this.user = user;
    this.password = password;
    this.token = token;
    this.test   = test;
    this.requestsLog = [];
  }

  async create(order) {

    const ret = await this.createOrder(order);
    if (ret.Cod_Status) throw Error(ret.Error + " - " + ret.Cod_Status);

    const waybillNumber = ret['shippings'][0]['invoice_number'];
    const waybill = await this.getwaybill(waybillNumber);

    return {
      id: waybillNumber,
      waybill: waybill.data,
    };
  }

  async track(id) {
    let orderStatus = null;
    let status = null;
    let code = null;
    const ret = await this.getDeliveryStatus(id);
    // console.log(JSON.stringify(ret));
 
    if (ret && ret['Status'] && ret['cod_status']) {
      status = ret['Status'];
      code = ret['cod_status'];
 
      if ([
          211 // Доставлен
        ].indexOf(code) > -1) {
        orderStatus = 'delivered';
      } else if ([
          201, // Присвоен номер заказа
          202, // Заказ передан курьеру для забора у отправителя
        ].indexOf(code) > -1) {
        orderStatus = 'confirmed';
      } else if ([
          217, // Возвращен
          221 // Груз возвращен
        ].indexOf(code) > -1) {
        orderStatus = 'returned';
      } else if ([
          204, // Забор груза отменен
          212, // Отказ получателем
          301, // Не точный адрес
          302, // Отказ от получения
          308, // Поломка авто
          309, // Не успел до 18:00
          310, // Получатель на звонки не отвечает
          312, // Истек срок ожидания/хранения
          313, // Нет доставки в населенный пункт
          216, // Поломка ТС
          220, // Оформлен возврат
          303, // Отсутствие получателя
        ].indexOf(code) > -1) {
        orderStatus = 'attention';
      } else {
        orderStatus = 'in_transit';
      }
    }
 
    return {
      orderStatus,
      status,
    };
  }

  async getRequestsLog() {
    return this.requestsLog;
  }

  async _makeRequest(api, req_method = 'GET', data = null, type = 'json') {
    // if (!this.test) throw Error('TEST ONLY so far!'); // TODO: remove later
    const url = this.test ? 'http://91.215.136.138/buhdemo/hs/integrationexternal/' : 'http://91.215.136.138/spark/hs/integrationexternal/';
    
    const opts = {
      method: req_method,
      body: data === null ? undefined : JSON.stringify(data),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(this.user + ":" + this.password).toString('base64')}`,
        'token': this.token, 
      },
    };
    const apiURL = url + api;
    const res = await fetch(apiURL, opts);
    let ret;
    if (type == 'json') {
      ret = await res.json();
    }
    if (type == 'text') {
      ret = await res.text();
    }
    if (type == 'blob') {
      ret = await res.blob();
    }

    this.requestsLog.push({
      date: new Date(),
      req: {
        url: apiURL,
        opts: opts,
      },
      res: ret,
    });

    return ret;
  }

  async createOrder(order) {
    const round = (num) => _round(num, 2);
    let serviceCode = '';
    let volume = (order.Packages.reduce((a, v) => a + (v.height * v.width * v.depth * v.quantity), 0))/1000000.;
    volume < 0.01 ? volume = 0.01 : volume = round(volume);

    let serviceInsurance = null;
    if (order.OrderServices.findIndex((s) => s.action == 'insurance') > -1 && order.declaredValue > 0) {
      serviceInsurance = order.declaredValue;
      serviceInsurance = 0;
    }

    if (order.RateType.type == 'standard') {
      serviceCode = 'Стандарт';
    } else if (order.RateType.type == 'express') {
      serviceCode = 'Экспресс';
    } else throw Error('createCourierRequest: wrong serviceCode');

    const data = {
      "consignor": {
        "country": "КАЗАХСТАН",
        "province": order.addressDetailsFrom.province,
        "city": order.addressDetailsFrom.city,
        "street": order.addressDetailsFrom.addressLine1,
        "building": order.addressDetailsFrom.addressLine2 ? ` ${order.addressDetailsFrom.addressLine2}`: '',
        "contact_person": order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName,
        "contact_phone": order.addressDetailsFrom.phone,
        "take_date": moment(order.pickupTime).format('YYYY-MM-DD'),
        "take_time": '10:00',
        "post_index": order.addressDetailsFrom.postCode
      },
      "shippings": [
        {
          "guid": order.refNo,
          "receiver": {
            "consignor_code": order.refNo,
            "returnable_documents": false,
            "name_product": order.contents,
            "verification": true,
            "country": "КАЗАХСТАН",
            "city": order.addressDetailsTo.city,
            "street": order.addressDetailsTo.addressLine1,
            "building": order.addressDetailsTo.addressLine2 ? ` ${order.addressDetailsTo.addressLine2}`: '',
            "contact_person": order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName,
            "contact_phone": order.addressDetailsTo.phone,
            "name": order.addressDetailsTo.companyName ? order.addressDetailsTo.companyName : (order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName),
            "post_index": order.addressDetailsTo.postCode,
            "type": order.addressDetailsTo.companyName ? "Юридическое лицо" : "Физическое лицо",
          },
          "cargo": {
            "shipment_type": serviceCode,
            "places": order.Packages.reduce((a, v) => a + v.quantity, 0),
            "weight": order.Packages.reduce((a, v) => a + (v.weight * v.quantity), 0),
            "volume": volume,
            "payment_method": "Перечислением на счет",
            "payment_type": "Отправителем",
            "cod": null,
            "declared_price": 0, // order.declaredValue ? order.declaredValue : 0,
            "annotation": order.externalComment
          }
        }
      ]
    };
    // console.log(data);
    const api = 'order';
    const res = await this._makeRequest(api, 'POST', data);

    return res;
  }

  async getwaybill(id) {
    const api = `order?invoice_number=${id}`;
    let data;
    try {
      const response = await this._makeRequest(api, 'PUT', null, 'blob');
      const buffer = Buffer.from(await response.arrayBuffer());
      data = parse(buffer);
      data = buffer.toString('base64');
    } catch(e) {
     throw Error('Order Error: ' + JSON.stringify(e));
    }
    return {
      id,
      data,
    }
  }


  async getDeliveryStatus(waybillNumber) {

    const api = `invoicestatus?invoice_number=${waybillNumber}`;
    const res = await this._makeRequest(api);

    return res;
  }
}

module.exports = SparkAPI;
