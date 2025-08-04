const config = require('../../config/app');
const moment = require('moment-timezone');
const _round = require('lodash/round');
const crypto = require('crypto');

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


class SmartDeliveryAPI {
  constructor(args = {}) {
    const {
      login,
      password,
      salt,
      clientID,
      instance,
    } = args;
    this.login = login;
    this.password = password;
    this.salt = salt;
    this.clientID = clientID;
    this.requestsLog = [];
    this.instance = instance
  }

  async create(order) {

    const ret = await this.createOrder(order);
    console.log(ret);
    if (ret[0].result.error) throw Error(ret[0].result.text);

    const waybillNumber = ret[0].data.Number;
    const waybill = await this.getwaybill(waybillNumber);

    return {
      id: waybillNumber,
      waybill: waybill.data,
    };
  }

  async track(id) {
    let orderStatus = null;
    let status = null;
    const ret = await this.getDeliveryStatus(id);
 
    if (!ret[0].result.error) {
      status = ret[0].data[0].Status;

      if (status == 'Создан клиентом' || status == 'Регистрация отправления') orderStatus = 'confirmed';
      if (status == 'В пути' || status == 'На доставке') orderStatus = 'in_transit';
      if (status == 'Доставлен') orderStatus = 'delivered';
      if (status == 'Задержка') orderStatus = 'attention';
    }
 
    return {
      orderStatus,
      status,
    };
  }

  async getRequestsLog() {
    return this.requestsLog;
  }

  generateAPIKey() {
    const ts = Date.now();
    const s = ts.toString().substring(0, 5) + this.salt;
    const hash = crypto.createHash('sha256').update(s).digest('hex');

    return hash;
  }

  async _makeRequest(api, req_method = 'GET', data = null, type = 'json', rawURL = false) {
    // if (!this.test) throw Error('TEST ONLY so far!'); // TODO: remove later
    const url = `https://stw.kz:4433/${this.instance}/hs/v1/`;

    
    const opts = {
      method: req_method,
      body: data === null ? undefined : JSON.stringify(data),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(this.login + ":" + this.password).toString('base64')}`,
      },
    };
    
    
    let apiURL = url + api + '?apikey=' + this.generateAPIKey();
    if (rawURL) apiURL = api;

    const res = await fetch(apiURL, opts);
    let ret;
    if (type == 'json') {
      ret = await res.json();
      console.log(apiURL + ':', JSON.stringify(ret));
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
    const data = {
      "Date": moment(order.pickupTime).unix(),
      "Places": order.Packages.reduce((a, v) => a + v.quantity, 0),
      "Weight": order.Packages.reduce((a, v) => a + (v.weight * v.quantity), 0),
      "Content": order.contents,
      "SenderName": order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName,
      "SenderPhone": order.addressDetailsFrom.phone,
      "SenderCity": order.addressDetailsFrom.city,
      "SenderAdress": order.addressDetailsFrom.addressLine1 + (order.addressDetailsFrom.addressLine2 ? ' ' + order.addressDetailsFrom.addressLine2 : ''),
      "SenderComment": order.externalComment,
      "ReceiverName": order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName,
      "ReceiverPhone": order.addressDetailsTo.phone,
      "ReceiverCity": order.addressDetailsTo.city,
      "ReceiverAdress": order.addressDetailsTo.addressLine1 + (order.addressDetailsTo.addressLine2 ? ' ' + order.addressDetailsTo.addressLine2 : ''),
      "ReceiverComment": order.externalComment,
    };

    const api = 'parcel/' + this.clientID;
    const res = await this._makeRequest(api, 'POST', data);

    return res;
  }

  async getwaybill(id) {
    const api = 'print/' + id;
    const res = await this._makeRequest(api);
    const link = res[0].data.Link;

    let data;
    try {
      const response = await this._makeRequest(link, 'GET', null, 'blob', true);
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

    const api = 'status/' + waybillNumber;
    const res = await this._makeRequest(api);

    return res;
  }
}

module.exports = SmartDeliveryAPI;
