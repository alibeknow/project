const config = require('../../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

const fetch = require('isomorphic-unfetch');


class AlemTatAPI {
  constructor(args = {}) {
    const {
      apiKey = 'e1ee337e-e29f-43e5-8728-da8abb0f0490',
      card = '21465352',
      senderName = 'ТОО «BESTSENDER» (БЕСТСЕНДЕР)',
      test = false,
    } = args;

    this.apiKey = apiKey;
    this.card   = card,
    this.senderName = senderName;
    this.test   = test;

    this.requestsLog = [];
  }

  async create(order) {
    const ret = await this.createOrder(order);
    const waybill = await this.getWaybill(ret.WayBill.WayBillDocumentId);

    return {
      id: ret.WayBill.WayBillNumber,
      waybill: waybill.ReportData,
    };
  }

  async track(id) {
    let orderStatus = null;
    let status = null;
    
    const ret = await this.getDeliveryStatus(id);
    //console.log(JSON.stringify(ret));

    if (ret && Array.isArray(ret['Shipments']) && ret['Shipments'].length > 0 && Array.isArray(ret['Shipments'][0]['Events']) && ret['Shipments'][0]['Events'].length > 0) {
      status = ret['Shipments'][0]['Events'][0]['Comment'];
      //console.log('status:', JSON.stringify(status));

      if (['НЕ ДОСТАВЛЕНО'].indexOf(status) > -1) {
        // orderStatus = 'confirmed'; // needs to be commented to keep in translit when not delivered into hands
      } else if (['УСПЕШНО ДОСТАВЛЕН', 'ДОСТАВЛЕНО ПОВРЕЖДЕННЫМ'].indexOf(status) > -1) {
        orderStatus = 'delivered';
      // } else if ([ ].indexOf(status) > -1) {
      //   orderStatus = 'attention';
      } else if ([
        // 'ОТКАЗ БРОНИРОВАНИЯ ЯЧЕЙКИ ПОСТАМАТА',
        // 'НЕВЕРНАЯ СОРТИРОВКА',
        'ОТКАЗ В ПОЛУЧЕНИИ',
        'ОТПРАВКА УНИЧТОЖЕНА',
        'ИЗЪЯТО ЗА ИСТЕЧЕНИЕМ СРОКА ХРАНЕНИЯ',
        'КОМПАНИЯ ПЕРЕЕХАЛА',
        'НЕВЕРНЫЙ АДРЕС',
        'УТЕРЯ',
        'ДВИЖЕНИЕ ПРИОСТАНОВЛЕНО',
        'ПОДЛЕЖИТ ИЗЪЯТИЮ ЗА ИСТЕЧЕНИЕМ СРОКА ХРАНЕНИЯ',
        'ОТПРАВКА ПОВРЕЖДЕНА',
        'ОТКАЗ В ПОЛУЧЕНИИ',
        'ИЗМЕНЕНИЕ АДРЕСА ДОСТАВКИ',
        'ВОЗВРАТ ОТПРАВИТЕЛЮ',
      ].indexOf(status) > -1) {
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

  async _makeRequest(api, data = null) {
    //if (!this.test) throw Error('TEST ONLY so far!'); // TODO: remove later
    const url = this.test ? 'http://api.alemtat.kz/test/json/' : 'http://api.alemtat.kz/web/json/';

    const opts = {
      method: data === null ? 'GET' : 'POST',
      body: data === null ? undefined : JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
      },
    };
    const apiURL = url + api;
    const res = await fetch(apiURL, opts);
    const json = await res.json();

    this.requestsLog.push({
      date: new Date(),
      req: {
        url: apiURL,
        opts: opts,
      },
      res: json,
    });

    return json;
  }

  async createOrder(order) {
    const resStations = await this.getStation();
    //console.log(resStations);

    let localCodeFrom, localCodeTo;
    let postCodeFrom = order.addressDetailsFrom.postCode;
    let postCodeTo = order.addressDetailsTo.postCode;
    let cityFrom = order.addressDetailsFrom.city;
    let cityTo = order.addressDetailsTo.city;

    const definePostCode = (cityName = '', postCode = '') => {
      let newPostCode = postCode;

      //postcode replacement rulles based on city should be here
      const city = cityName.toUpperCase();
      if (city == 'УРАЛЬСК') newPostCode  = '090000';
      if (city == 'АКТАУ') newPostCode    = '130000';
      if (city == 'АТЫРАУ') newPostCode   = '060000';
      if (city == 'АКТОБЕ') newPostCode   = '030000';
      if (city == 'ШЫМКЕНТ') newPostCode  = '160000';
      if (city == 'АЛМАТЫ') newPostCode   = '050000';
      if (city == 'КОКШЕТАУ') newPostCode = '020001';

      //postcode replacement rulles based on code should be here
      if (postCode == '100000') newPostCode = '100024';

      return newPostCode;

    } 
    
    postCodeFrom = definePostCode(cityFrom, postCodeFrom);
    postCodeTo = definePostCode(cityTo, postCodeTo);

    console.log(postCodeFrom);
    console.log(postCodeTo);

    const resLocalityCodeFrom = await this.getCitiesByZIP(postCodeFrom);
    //console.log('LocalityCodeFrom: ', resLocalityCodeFrom);
    if (resLocalityCodeFrom.length == 0) throw Error('createOrder: LocalityCodeFrom not found');
    if (resLocalityCodeFrom.length > 0) {
      localCodeFrom = resLocalityCodeFrom.find((e) => resStations.findIndex((n) => e.LocalCode === n.LocalCode) !== -1);
      if (!localCodeFrom) throw Error('createOrder: localCodeFrom not found in the list of stations');
    }
    //console.log('localCodeFrom: ', localCodeFrom);

    const resLocalityCodeTo = await this.getCitiesByZIP(postCodeTo);
    //console.log('LocalityCodeTo: ', resLocalityCodeTo);
    if (resLocalityCodeTo.length == 0) throw Error('createOrder: LocalityCodeTo not found');
    if (resLocalityCodeTo.length == 1) {
      localCodeTo = resLocalityCodeTo.pop();
    } else {
      //localCodeTo = resLocalityCodeTo.find((e) => resStations.findIndex((n) => e.LocalCode === n.LocalCode) !== -1);
      //if (!localCodeTo) throw Error('createOrder: localCodeTo not found (2)');
      localCodeTo = resLocalityCodeTo.find((e) => e.LocalityName.toUpperCase() == order.addressDetailsTo.city.toUpperCase());
      if (!localCodeTo) throw Error('createOrder: localCodeTo not found for a city "' + order.addressDetailsTo.city + '" in the array of postcode matched localities');
    }
    //console.log('localCodeTo: ', localCodeTo);

    const resCourierRequest = await this.createCourierRequest(order, localCodeFrom.LocalCode);
    //console.log(resCourierRequest);
    if (resCourierRequest.ErrorCode != 0 && resCourierRequest.ErrorCode != 200) throw Error('createCourierRequest: Error, ErrorCode=' + resCourierRequest.ErrorCode);

    const resEWayBill = await this.regEWayBill(order, resCourierRequest.RequestId, localCodeTo.LocalCode);
    //console.log(resEWayBill);

    return {
      "CourierRequest": resCourierRequest,
      "WayBill": resEWayBill,
    };
  }

  async createCourierRequest(order, localityCode) {
    let serviceCode = '';

    if (order.RateType.type == 'economy') {
      serviceCode = 'ECO';
    } else if (order.RateType.type == 'express') {
      serviceCode = 'E';
    } else if (order.RateType.type == 'city') {
      serviceCode = 'C';
    } else throw Error('createCourierRequest: wrong serviceCode');

    const data = {
      "Date": moment(order.pickupTime).format('YYYY-MM-DD'),
      "Card": this.card,
      "SenderName": this.senderName,
      //"Lunch": "без обеда",
      "LocalityCode": localityCode,
      "AddressDetail": order.addressDetailsFrom.addressLine1 + (order.addressDetailsFrom.addressLine2 ? ` ${order.addressDetailsFrom.addressLine2}`: ''),
      "ContactName": order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName,
      "Phone": order.addressDetailsFrom.phone,
      //"ReadyFor": "готово",
      "PickUp": order.Carrier.RateParams[0].pickupBefore.substring(0, 5),
      "Service": serviceCode,
      //"IsLargeVolume": true,
      //"IsLargeWeight": true,
      "Note": order.externalComment,
    };
    const api = `CourierRequest/CourierRequest?ApiKey=${this.apiKey}`;
    const res = await this._makeRequest(api, data);

    return res;
  }

  async regEWayBill(order, requestId, localityCode) {
    let serviceCode = '';

    if (order.RateType.type == 'economy') {
      serviceCode = 'ECO';
    } else if (order.RateType.type == 'express') {
      serviceCode = 'E';
    } else if (order.RateType.type == 'city') {
      serviceCode = 'C';
    } else throw Error('createCourierRequest: wrong serviceCode');

    let cashAssigment = undefined;
    if (order.OrderServices.findIndex((s) => s.action == 'cash_assigment') > -1) {
      cashAssigment = {
        "RNumber": this.card,
        "Amount": order.declaredValue,
      };
    }

    let declaredValue = undefined;
    if (order.OrderServices.findIndex((s) => s.action == 'insurance') > -1) {
      declaredValue = order.declaredValue;
    }

    const data = {
      "RequestId": requestId,
      "Recipient": {
        "Company": order.addressDetailsTo.companyName,
        "Contact": order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName,
        //"INN": "sample string 3",
        "Tel": order.addressDetailsTo.phone,
        "email": order.addressDetailsTo.email,
        "LocalityCode": localityCode,
        //"LocalityName": "sample string 7",
        "Zip": order.addressDetailsTo.postCode,
        "AddressDetail": order.addressDetailsTo.addressLine1 + (order.addressDetailsTo.addressLine2 ? ` ${order.addressDetailsTo.addressLine2}`: ''),
      },
      //"CodeOfPV": "sample string 2",
      "Service": serviceCode,
      "Place": order.Packages.reduce((a, v) => a + v.quantity, 0),
      "Weight": order.Packages.reduce((a, v) => a + v.weight, 0),
      "DeclareAmount": declaredValue,
      "CashAssigment": cashAssigment,
      "Content": order.contents,
    };
    const api = `WayBill/regEWayBill?ApiKey=${this.apiKey}`;
    const res = await this._makeRequest(api, data);

    return res;
  }

  async getWaybill(wayBillDocumentId) {
    const api = `WayBill/GetReportEAWBN?WayBillDocumentId=${wayBillDocumentId}&ApiKey=${this.apiKey}`;
    const res = await this._makeRequest(api);
    return res;
  }

  async getCitiesByZIP(zipcode) {
    const api = `Catalog/getCitiesByZIP?ZIP=${encodeURIComponent(zipcode)}&ApiKey=${this.apiKey}`;
    const res = await this._makeRequest(api);
    return res;
  }

  async getCities(city) {
    const data = {
      "CityName": city,
    };
    const api = `Catalog/GetCitiesAsync?ApiKey=${this.apiKey}`;
    const res = await this._makeRequest(api, data);
    return res;
  }

  async getStation() {
    const api = `Catalog/getStation?ApiKey=${this.apiKey}`;
    const res = await this._makeRequest(api);
    return res;
  }

  async getDeliveryStatus(wayBillNumber) {
    const api = `Find/getWayBill?Number=${encodeURIComponent(wayBillNumber)}&ApiKey=${this.apiKey}`;
    const res = await this._makeRequest(api);
    return res;
  }
}

module.exports = AlemTatAPI;
