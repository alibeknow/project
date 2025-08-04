const config = require('../../config/app');
const moment = require('moment-timezone');
const _round = require('lodash/round');
const configLib = require('../config');
const fs = require('fs');
const util = require('util');
const path = require('path');
const fsWriteFileAsync = util.promisify(fs.writeFile);
const fsReadFileAsync  = util.promisify(fs.readFile);

moment.tz.setDefault(config.timezone);

const fetch = require('isomorphic-unfetch');


class RocketDeliveryAPI {
  constructor(args = {}) {
    const {
      yaToken = config.rocketdelivery.yaToken,
      jwt = config.rocketdelivery.jwt,
      refreshToken = config.rocketdelivery.refreshToken,
      
      test = config.rocketdelivery.test,
    } = args;

    this.yaToken = yaToken;
    this.refreshToken = refreshToken;
    this.jwt = jwt;
    this.test = test;

    this.requestsLog = [];
  }

  async _makeRequest(api, req_method = 'GET', data = null, type = 'json') {
    const tokens = await this._returnTokens();
    if (!tokens) throw Error('Failed to get tokens');
    const jwt = tokens.access;
    const url = this.test ? 'https://dev-server.chocodostavka.kz/' : 'https://server.chocodostavka.kz/';
    
    const opts = {
      method: req_method,
      body: data === null ? undefined : JSON.stringify(data),
      headers: {
        'Authorization': `JWT ${ jwt }`,
        'Content-Type': 'application/json',
      },
    };
    const apiURL = url + api;
    const res = await fetch(apiURL, opts);


    let ret = await res.json();
    if (![200, 201].includes(res.status)) {
      console.warn('ERROR!');
      console.warn('Request to URI ', apiURL);
      console.warn('Request options ', opts);
      console.warn('status: ', res.status);
      console.warn('status description: ', res.statusText);
      console.warn('Ret JSON: ', JSON.stringify(ret));

      throw Error('Bad responce: ', JSON.stringify(res.body));

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

  async _saveToCache(filename, json={}) {
    const data = {
      date:`${ new Date() }`, 
      tokens: json
    };

    try {
      await fsWriteFileAsync(filename, JSON.stringify(data, null, 4));
        console.log(`Keys successfully stored to ${filename}`);
    } catch (error) {
        console.error(`Error due the storing the cache: ${error.message}`);
    }
  }

  async _readFromCache(filename) {
    try {
      const data = await fsReadFileAsync(filename, 'utf8');

      return JSON.parse(data);

    } catch (error) {
        console.warn('Error read from cache');
        console.warn(error);

        return null;
    }
  }

  _isValid(date) {
    const cachingTime = this.test ? 24*3600 : 5*30*24*3600;
    const inputDate = new Date(date);
    if (isNaN(inputDate)) throw new Error('Invalid date format');
    const dateDiff = new Date() - inputDate;

    return (dateDiff < cachingTime);
  }

  async _refreshTokens() {
    const url = this.test ? 'https://dev-server.chocodostavka.kz/' : 'https://server.chocodostavka.kz/';
    const api = 'api-gate/v0/common/api-token-refresh';
    const data = {
      'refresh': this.refreshToken
    }

    const opts = {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Authorization': `JWT ${ this.jwt }`,
        'Content-Type': 'application/json',
      },
    };
    const apiURL = url + api;
    const res = await fetch(apiURL, opts);
    
    if (res.status != 200) {
      console.warn('ERROR!');
      console.warn('Request to URI ', apiURL);
      console.warn('Request options ', opts);
      console.warn('status: ', res.status);
      console.warn('status description: ', res.statusText);
      throw Error('Bad responce: ', JSON.stringify(res.body));
    }

    let ret = await res.json();

    if (!!ret.access) return (ret);

    return null;
  }

  async _returnTokens() {
    let tokens = null;
    const cacheFile = path.dirname(__filename) + '/../../cache/api_rocketdelivery.cache';

    if (fs.existsSync(cacheFile)) {
      const cache = await this._readFromCache(cacheFile);
      this.refreshToken = cache.tokens.refresh;
      this.jwt = cache.tokens.access;
      if (this._isValid(cache.date)) tokens = cache.tokens;
    }

    if (!tokens) {
      tokens = await this._refreshTokens();
      await this._saveToCache(cacheFile, tokens);
    }

    return tokens;
  }

  _formatRate = (rate) => {
    let ret = null;
    if (rate.transport == 'FOOT' || !rate.is_fastest) return;

    if (typeof(rate) != 'undefined')
      ret =  {
        'price': rate.price,
        'extra': {
          'deliveryTime': {
            'from': '0', // rate.time,
            'to': '1'    // rate.time
          },
          'code': rate.id,
          'name': 'Rocket Delivery',
        },
      };

    if (!!ret) return(ret);
  }

  _formatGeoComponents = (addrComponents) => {
    return addrComponents.reduce((obj, item) => {
      obj[item.kind] = item.name;
      return obj;
    }, {});
  }

  _formatGeoobject = (geoobject) => {
    const coords = geoobject.GeoObject.Point.pos.replace(' ','|');
    const addressComponents = geoobject.GeoObject.metaDataProperty.GeocoderMetaData.Address.Components;
    return {
      point: {
        coordinates: coords,
        long: coords.split('|')[0],
        lat: coords.split('|')[1],
      },
      address: this._formatGeoComponents(addressComponents)
    }
  }

  _formatAddress = (addressGeoComponents) => {

    return {
      "city": addressGeoComponents.address.locality,
      "street": addressGeoComponents.address.street ? addressGeoComponents.address.street : addressGeoComponents.address.district,
      "building": addressGeoComponents.address.house,
      "longitude": addressGeoComponents.point.long,
      "latitude": addressGeoComponents.point.lat
    }
  }

  _trimPhoneNumber = (phone) => {
    let res = phone.trim().replace(/\D+/g, '');
    if (res.slice(0, 1) == '80') res = '7' + res.slice(2);

    return('+' + res);
  };

  async _getGeocode(address, apiKey = this.yaToken) {
    let geo = null;
    if (typeof(address) != 'undefined') {
      
      if (!address.city) address.city = 'Алматы';

      let formatedAddress =  `${ address.countryCode }, ${ address.postCode }, ${ address.city }, ${ address.addressLine1 }`;
      formatedAddress = formatedAddress.split(' ').filter((str) => str !=='').join('+');
      const uri = `https://geocode-maps.yandex.ru/1.x/?apikey=${ apiKey }&geocode=${ formatedAddress }&format=json&lang=ru_RU`;
      const res = await fetch(uri);
      if (res.status && res.status == 200) {
        geo = await res.json();
        const ret = geo.response.GeoObjectCollection.featureMember.map((geoobj) => this._formatGeoobject(geoobj));

        console.log('getGeocode Input addr: ', address);
        console.log('getGeocode Output addr  (ret): ', ret);
        // console.log('GEO obj RAW', JSON.stringify(geo));

        return ret;
      }
    }
    
    if (!geo) {
      console.warn(`Could not get coordinates for ${ address }`);
      console.warn(`Server returned response status ${ res.status }`);
      throw Error(JSON.stringify(res));
    }

    return null; 
  }

  async getRequestsLog() {
    return this.requestsLog;
  }

  async create(order) {
    const ret = await this.createOrder(order);
    const id = ret.group_id;
    const waybill = null;
    
    return {
      id,
      waybill,
    };
  }

  async createOrder(order) {


    const from = (await this._getGeocode(order.addressDetailsFrom)).shift();
    const to = (await this._getGeocode(order.addressDetailsTo)).shift();
    const api = 'api-gate/v0/deliveries/groups';
    const data = {
      "is_fastest": true, // order.RateType.type == 'super_express',  //EXPRESS
      "points": [
        {
          "order_comment": order.externalComment ? order.externalComment : order.addressDetailsFrom.addressLine2,
          "tasks": [], //SERVICES
          "contact_info": {
            "phone_number": this._trimPhoneNumber(order.addressDetailsFrom.phone),
          },
          "address": {
            ... this._formatAddress(from),
            "extra_info": order.addressDetailsFrom.addressLine2 ? order.addressDetailsFrom.addressLine2.trim().substr(200) : order.addressDetailsFrom.addressLine1.trim().substr(200),
          },
        },
        {
          "order_comment": order.externalComment,
          "tasks": [],
          "contact_info": {
            "phone_number": this._trimPhoneNumber(order.addressDetailsTo.phone),
          },
          "address": {
            ... this._formatAddress(to),
            "extra_info": (order.addressDetailsTo.addressLine2 ? order.addressDetailsTo.addressLine2 : order.addressDetailsTo.addressLine1).trim().substr(200),
          },
        }
      ]
    };
    // console.log('address from: ', from);
    // console.log('address to: ', to);
    // console.log('createOrder Data: ', JSON.stringify(data));

    const res = await this._makeRequest(api, 'POST', data);;

    return res;
  }

  async track(id) {
    api = `gate/v0/deliveries/groups/${ id }`;
    let orderStatus = null;
    let status = null;
    //   Статусы (**state**) группы заказов :
    // - `CREATED` – создан;
    // - `PLANNED` — запланирован;
    // - `LOOKING_FOR_COURIER` – поиск курьера;
    // - `IN_THE_WAY` – в пути;
    // - `CANCELED` – отменен;
    // - `COMPLETED` – доставлен;
    const res = await this._makeRequest(api);
    status = res.state;
    switch (status) {
      case 'COMPLETED':
        orderStatus = 'delivered';
      
      case 'CREATED':
        orderStatus = 'confirmed';

      default:
        orderStatus = 'in_transit';
    }
    return {
      orderStatus,
      status,
    };
  }

  async getRate(order) {
    console.log('getRate', order);

    // Needs "<long>|<lat>"
    let ret = null;
    const from = (await this._getGeocode(order.addressDetailsFrom)).shift();
    const to = (await this._getGeocode(order.addressDetailsTo)).shift();
    // console.log(`from: ${ JSON.stringify(order.addressDetailsFrom) } => ${ JSON.stringify(from) }`);
    // console.log(`to: ${ JSON.stringify(order.addressDetailsTo) } => ${ JSON.stringify(to) }`);


    const api ='api-gate/v0/deliveries/tariffs';
    const data = {
      "points": [
        { "coordinates": from.point.coordinates },
        { "coordinates": to.point.coordinates },
      ]
    }
    const res = await this._makeRequest(api, 'POST', data);
    if (!!res.tariffs) {
      ret = res.tariffs.map((rate) => this._formatRate(rate)).filter(Boolean);
    }

    // console.warn('unformatted Rate: ', res);
    // console.warn('formatted Rate: ', ret);

    return ret;
  }
}

module.exports = RocketDeliveryAPI;
