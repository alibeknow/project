const config = require('../../config/app');
const moment = require('moment-timezone');
const _round = require('lodash/round');
const { v4: uuid_v4 } = require('uuid');
const configLib = require('../config');

moment.tz.setDefault(config.timezone);

const fetch = require('isomorphic-unfetch');

// there's no test mode in the YaGo
// estimate -> create -> confirm -> track
class YandexAPI {
  constructor(args = {}) {
    const {
      token = config.yandex.token,
      // token = 'AQAAAABdvpOoAAVM1ci_PXdXNkDkuwoSsRuKoXA', new cabinet - wrong behavior

    } = args;
    this.token = token;
    this.requestsLog = [];
  }

  _formatToYandexGo = (parcel) => {
    return (
      {
        'quantity': +parcel.quantity,
        'size': {
          'height': +parcel.height / 100,
          'length':  +parcel.depth / 100,
          'width': +parcel.width / 100
        },
        'weight':  +parcel.weight
      }
    );
  };

  _trimPhoneNumber = (phone) => {
    let res = phone.trim().replace(/\D+/g, '');
    if (res.slice(0, 1) == '80') res = '7' + res.slice(2);

    return('+' + res);
  };

  _parseCoordinates =(string) => {
    return (string.split(' ').map(n => +n));
  }

  async estimate(order) { 
    const parcels = (order.Packages) ? order.Packages : order.packages;
    const data = {
      'items': parcels.map(this._formatToYandexGo),
      'route_points': [
        { 'coordinates': this._parseCoordinates(order.addressDetailsFrom.addressLine2) },		
        {	'coordinates': this._parseCoordinates(order.addressDetailsTo.addressLine2) }
      ],
      // "requirements": {
      //   'taxi_class': 'express',
      // },
      'skip_confirmation': true,
      'skip_door_to_door': true
    }
    const api = 'v1/check-price';

    const res = await this._makeRequest(api, 'POST', data);
    if (res.code && res.code != 200) throw Error(JSON.stringify(res));

    return(res)
  }

  async create(order) {
    const ret = await this._confirmOrder(order.tracking);// createOrder runs due to the getting rate
    if (ret.message) {
      throw Error(JSON.stringify(ret));
    }
    const id = ret.id;
    // const version = ret.version;
    const waybill = null;
    
    return {
      id,
      waybill,
    };
  }

  async track(uuid) {

    let orderStatus = null;
    let status = null;
    let data = null;

    const api = `v2/claims/info?claim_id=${ uuid }`;
    const ret = await this._makeRequest(api, 'POST', data);
    if (ret.code && ret.code != 200) throw Error(JSON.stringify(ret));

    if (ret && ret.status) {
      status = ret['status'];
    }
    if ([
      'delivered',
      'delivered_finish',
    ].indexOf(status) > -1) {
    orderStatus = 'delivered';
    } else if ([
      'cancelled',
      'cancelled_with_items_on_hands',
      'performer_not_found',
    ].indexOf(status) > -1) {
    orderStatus = 'canceled';
    } else if ([
      'cancelled_by_taxi',
      'cancelled_with_payment',
    ].indexOf(status) > -1) {
    orderStatus = 'idle_run';
    } else if ([
      'returned',
      'returned_finish',
    ].indexOf(status) > -1) {
    orderStatus = 'returned';
    } else if ([
      'estimating_failed',
      'failed',
    ].indexOf(status) > -1) {
    orderStatus = 'declined';
    }  else if ([
      'ready_for_return_confirmation',
      'cancelled_with_items_on_hands',
    ].indexOf(status) > -1) {
    orderStatus = 'attention';
    }  else if ([
      'ready_for_approval',
    ].indexOf(status) > -1) {
    orderStatus = null;
    }   else {
      orderStatus = 'in_transit';
    }
    return {
      orderStatus,
      status,
    };
  }

  async info(uuid) {
    const data = null;
    const api = `v2/claims/info?claim_id=${ uuid }`;
    const res = await this._makeRequest(api, 'POST', data);
    if (res.code && res.code != 200) throw Error(JSON.stringify(res));

    return(res)
  }

  async cancel(uuid) {
    const _ret = await this.cancelState(uuid);
    if (_ret.code != 200) {
      throw Error(JSON.stringify(_ret));
    }
    const state = _ret.cancel_state;
    const ver = _ret.version;
    const data = {
      version: ver,
      cancel_state: state // 1:"free", 2:"paid"
    };
    const api = `v1/claims/cancel?claim_id=${ uuid }`;
    const ret = await this._makeRequest(api, 'POST', data);
    if (ret.code != 200) {
      throw Error(JSON.stringify(ret));
    }
    return ret;
  }

  async getRequestsLog() {
    return this.requestsLog;
  }

  async _makeRequest(api, req_method = 'GET', data = null, type = 'json') {
    // if (!this.test) throw Error('TEST ONLY so far!'); // TODO: remove later
    const url = 'https://b2b.taxi.yandex.net/b2b/cargo/integration/';
    
    const opts = {
      method: req_method,
      body: data === null ? undefined : JSON.stringify(data),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Accept-Language' : 'ru',
        'Authorization': `Bearer ${ this.token }`,
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
    const { siteName, currencyCode } = await configLib.get();
    const packages = (order.Packages ? order.Packages : order.packages).map(this._formatToYandexGo);
    const parcels = packages.map((parcel) => ({
      ...parcel,
      cost_currency: currencyCode,
      cost_value: "0",
      title: 'шт',
      pickup_point: 1,  // == route_points[0].point_id in case of point 2 point delivery
      droppof_point: 2,  // == route_points[1].point_id in case of point 2 point delivery
    }));
    
    const data = {
      'taxi_class': 'express', //courier, express, cargo
      'comment': order.externalComment == '' ? order.externalComment : '--',
      'emergency_contact': {
        'name': `${ order.addressDetailsFrom.firstName } ${ order.addressDetailsFrom.lastName }`,
        'phone': this._trimPhoneNumber(order.addressDetailsFrom.phone)
      },
      'items': parcels,
      'route_points': [
        {
          'address': {
            'comment': `Доставка от сервиса ${ siteName }. Сообщите отправителю, что заказ по доставке Яндекс.Такси. Назовите код заказа и заберите посылку. Заказ оплачен безналично, при передаче заказа нельзя требовать с получателя деньги за доставку.`,
            'coordinates': this._parseCoordinates(order.addressDetailsFrom.addressLine2),
            'fullname': `${ order.addressDetailsFrom.country }, ${ order.addressDetailsFrom.city }, ${ order.addressDetailsFrom.addressLine1 }`,
          },
          'contact': {
            'email': order.addressDetailsFrom.email,
            'name': `${ order.addressDetailsFrom.firstName } ${ order.addressDetailsFrom.lastName }`,
            'phone': this._trimPhoneNumber(order.addressDetailsFrom.phone),
          },
          'point_id': 1,
          'type': 'source',
          'visit_order': 1
        },
        {
          'address': {
            'comment': order.externalComment,
            'coordinates': this._parseCoordinates(order.addressDetailsTo.addressLine2),
            'fullname': `${ order.addressDetailsTo.country }, ${ order.addressDetailsTo.city }, ${ order.addressDetailsTo.addressLine1 }`,
          },
          'contact': {
            'email': order.addressDetailsTo.email,
            'name': `${ order.addressDetailsTo.firstName } ${ order.addressDetailsTo.lastName }`,
            'phone': this._trimPhoneNumber(order.addressDetailsTo.phone),
          },
          'point_id': 2,
          'type': 'destination',
          'visit_order': 2
        },
      ],
      'skip_client_notify': false, // default true
      'skip_door_to_door': true, // porch 2 porch
      'skip_emergency_notify': false // do not notify emerg contact
    };
    const api = `v2/claims/create?request_id=${ uuid_v4() }`;
    const res = await this._makeRequest(api, 'POST', data);
    if (res.code && res.code != 200) throw Error(JSON.stringify(res));
    order.tracking = res.id;

    return res;
  }

  async _confirmOrder(uuid, version = 1) {

    const data = {
      version
    };
    const api = `v2/claims/accept?claim_id=${ uuid }`;
    const res = await this._makeRequest(api, 'POST', data);

    if (res.code && res.code != 200) throw Error(JSON.stringify(res));

    return(res)
  }

  async _cancelState(uuid) {
    const data = null;
    const api = `v2/claims/cancel-info?claim_id=${ uuid }`;
    const res = await this._makeRequest(api, 'POST', data);

    if (res.code && res.code != 200) throw Error(JSON.stringify(res));
    return(res)
  }
}

module.exports = YandexAPI;
