const config = require('../../config/app');
const moment = require('moment-timezone');
const _round = require('lodash/round');
const { v4: uuid_v4 } = require('uuid');

moment.tz.setDefault(config.timezone);
const fetch = require('isomorphic-unfetch');

class SdekAPI {
  static jwt;

  constructor(args = {}) {
    const {
      account = config.sdek.user,
      password = config.sdek.password,
      test = false,
    } = args;
    this.account = account;
    this.password = password;
    this.test = test;
    this.requestsLog = [];
    this.jwt = null;
    this.tokenRequests = 0;
  }

  _serialize = (obj) => {
    let res = [];

    for (let key in obj){
      let val = obj[key];
      if (obj.hasOwnProperty(key) && !!val) {
        res.push(encodeURIComponent(key) + "=" + encodeURIComponent(val));
      }
    }

    return res.join("&");
  }

  _trimPhoneNumber = (phone) => {
    let res = phone.trim().replace(/\D+/g, '');
    if (res[0] != '7') {
      if (res.slice(0, 1) == '80') res = '7' + res.slice(2);
    }

    return('+' + res);
  };

  _formatParcel = (packages, serviceCode) => {

    let ret = {
      'amount': 1,
      'number': moment().unix(),
      'width':  +(packages.reduce((a, p) => Math.max(a, p.width), 0)),
      'height': +(packages.reduce((a, p) => Math.max(a, p.height), 0)),
      'length': +(packages.reduce((a, p) => a + (p.depth * p.quantity), 0)),
      'weight': +(packages.reduce((a, p) => a + (p.weight * p.quantity), 0)) * 1000,
    }
    if (serviceCode == 139) {
      ret = {
        ...ret,
        "items" : [ 
          {
            "ware_key" : moment().unix(),
            "payment" : {
              "value" : 0
            },
            "name" : "Доставка",
            "cost" : 0,
            "amount" : 1,
            "weight" : +(packages.reduce((a, p) => a + (p.weight * p.quantity), 0)) * 1000,
          } 
        ],
      }
    }

    return ( ret );
  }

  async _formatAddress(address) {

    let data = null;
    if (config.type == 'bestsender') {
      let regionCode = address.postCode.substr(0, 4); //fuzzy search
      const addressBook = {
        '0100': { //010000
          city: 'Нур-Султан (Астана)',
          code: 4961
        },
        '0500': { //050000
          city: 'Алматы',
          code: 4756
        },
        '1300': { //130000
          city: 'Актау',
          code: 13435
        },
        '0300': { //030000
          city: 'Актобе',
          code: 4693
        },
        '0600': { //060000
          city: 'Атырау',
          code: 4994
        },
        '1302': { //130200
          city: 'Жанаозен',
          code: 14057
        },
        '1006': { //100600
          city: 'Жезказган',
          code: 7144
        },
        '0408': { //040800
          city: 'Капшагай',
          code: 7656
        },
        '1000': { //100000
          city: 'Караганда',
          code: 7669
        },
        '0409': { //040900
          city: 'Каскелен, Алматинская обл, Карасайский район',
          code: 7735
        },
        '0200': { //020000
          city: 'Кокшетау',
          code: 8064
        },
        '0804': { //080400
          city: 'Кордай',
          code: 33577
        },
        '1100': { //110000
          city: 'Костанай',
          code: 8199
        },
        '1115': { //111500
          city: 'Рудный',
          code: 10729
        },
        '1200': { //120000
          city: 'Кызылорда',
          code: 8402
        },
        '0407': { //040700
          city: 'Отеген батыр',
          code: 14148
        },
        '1400': { //140000
          city: 'Павлодар',
          code: 10020
        },
        '1500': { //150000
          city: 'Петропавловск',
          code: 10212
        },
        '1011': { //101100
          city: 'Приозёрск',
          code: 22981
        },
        '0713': { //071300
          city: 'Риддер',
          code: 14338
        },
        '0714': { //071400
          city: 'Семей (Семипалатинск)',
          code: 15481
        },
        '0400': { //040000
          city: 'Талдыкорган, Алматинская обл',
          code: 11490
        },
        '0800': { //080000
          city: 'Тараз, Жамбылская обл',
          code: 11518
        },
        '1014': { //101400
          city: 'Темиртау',
          code: 11584
        },
        '1612': { //161200
          city: 'Туркестан',
          code: 11789
        },
        '0900': { //090000
          city: 'Уральск',
          code: 11883
        },
        '0700': { //070000
          city: 'Усть-Каменогорск',
          code: 11903
        },
        '1600': { //160000
          city: 'Шымкент',
          code: 12787
        },
        '1412': { //141200
          city: 'Экибастуз, Экибастузский р-н',
          code: 12830
        },
        '1609': { //160900
          city: 'Сарыагаш, Туркестанская обл.',
          code: 63252
        },
        '0215': { //021500
          city: 'Степногорск',
          code: 11387
        },
        '0810': { //081000
          city: 'Шу',
          code: 14234
        },
        '0217': { //021700
          city: 'Щучинск',
          code: 78157
        },
        '1003': { //100300
          city: 'Балхаш, Карагандинская обл',
          code: 5125
        },
        '0416': { //041609
          city: 'Бесагаш',
          code: 44650
        },
        
      };
      data = addressBook[regionCode];
    }

    if(!data || typeof(data) == 'undefined')
      data = await this._getCityInfo(address);

    return ({
      ...data,
      'address' : `${ address.addressLine1 } ${ address.addressLine2 != '' ? ', ' + address.addressLine2 : '' }`
    });
  };

  _formatPerson = (address) => {

    return({
          'company': address.companyName != '' ? address.companyName : 'Частное лицо',
          'name': `${ address.firstName } ${ address.lastName }`,
          'email': address.email != '' ? address.email : 'info@bestsender.kz',
          'phones': [
              {
                'number': this._trimPhoneNumber(address.phone)
              }
          ],
          'passport_requirements_satisfied': false
    })
  };

  _formatRate = (rate) => {
    let res = null;
    if (rate.hasOwnProperty('delivery_sum') && !!rate.delivery_sum)
      res = {
        'price': rate.delivery_sum,
        'extra': {
          'deliveryTime': {
            'from': rate.calendar_min,
            'to': rate.calendar_max
          },
          'code': null,
          'name': null,
        },
      }
    
    return res;
  }

  _sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async _getToken() {
    const url = this.test ? 'https://api.edu.cdek.ru/v2/' : 'https://api.cdek.ru/v2/';
    const api = 'oauth/token?parameters';
    const data = {
      'grant_type': 'client_credentials',
      'client_id': this.account,
      'client_secret': this.password
    }

    const formBody = Object.keys(data).map(key => encodeURIComponent(key) + '=' + encodeURIComponent(data[key])).join('&');
    const opts = {
      method: 'POST',
      body: formBody,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    };
    const apiURL = url + api;
    const res = await fetch(apiURL, opts);

    let ret = await res.json();
    console.log('_getToken res (' + res.status + ')');
    // console.log(JSON.stringify(ret));

    if (ret.access_token) {

      return (ret.access_token);
    } else {

      return null;
    }
  }

  async _getCityInfo(address) {
    const data = {
      'country_codes' : address.countryCode,
      'postal_code' : parseInt(address.postCode) ? address.postCode : null,
      'fias_guid' : address.fiasGUID,
      'kladrCode' : address.kladrCode,
    }

    const api = `location/cities/?${ this._serialize(data) }`;
    const res = await this._makeRequest(api, 'GET', null);

    if (res.code && res.code != 200) {
      console.warn('There is no information for this city!', address);
      console.warn(JSON.stringify(res));

      return null;
    }

    return res[0];
  }

  _returnServiceCode(rateType) {
    if (config.type == 'bestsender') {
      
      switch (rateType) {
        // case 'super_express':
          //  return (60); // Супер-экспресс до 14  дверь-дверь
        case 'express':
          return (480); // 'Экспресс дверь-дверь'
        default:
          throw Error('Undefined rate type');
      }

    } else if (config.type == 'packon') {

      switch (rateType) {
        case 'super_express':
          return 3;     // Супер-экспресс 18 дверь-дверь
        case 'express':
          return 480;   // 'Экспресс дверь-дверь'
        case 'daily':
          return  null  ;   // Блиц экспресс 19 дверь-дверь, пока нет кода
        case 'standard':
          return 139;   // Посылка дверь-дверь
      }
      
    } else {
      throw Error ('Unsupported config type');
    }

  }
  
  async getRate(order){
    let rate = null;
    let packages = ((order.Packages) ? order.Packages : order.packages);

    const rateType = ((order.hasOwnProperty('RateType') && order.RateType.type != undefined ) ? 
    order.RateType.type : order.rate.RateType.type);
    const serviceCode = this._returnServiceCode(rateType);
    if(!serviceCode) return;

    const data = {
      'type': serviceCode == 139 ? 1 : 2, // 1 = Store, 2 = Delivery
      'tariff_code': serviceCode, 
      'from_location': await this._formatAddress(order.addressDetailsFrom),
      'to_location': await this._formatAddress(order.addressDetailsTo),
      'packages': [{ 
                    ...this._formatParcel(packages, serviceCode),
                    'comment': order.externalComment != '' && 
                    order.externalComment != undefined ? 
                    order.externalComment : (order.contents ? order.contents : 'Документы')
                  }],
    }

    // console.warn('SDEK DATA: ', data)

    const api = 'calculator/tariff'; //single rate-by-type api, req is the same
    // const api = 'calculator/tarifflist'; // - awailable rates list api, req is the same
    
    let res = await this._makeRequest(api, 'POST', data);
    if (res.code && res.code != 200 || (res.hasOwnProperty('errors') && !!res.errors.length)) throw Error(JSON.stringify(res));

    Array.isArray(res) ? 
      rate = res.map((rate) => this._formatRate(rate)) :
      rate = this._formatRate(res);

      // console.log('SDEK Rate: ', rate);
      // console.log('Rate Code: ', this._returnServiceCode(rateType));
    return(rate);
  }

  async create(order) {

    let waybillId;

    const orderPlace = await this.createOrder(order);
    // console.log('order place related entities: ', JSON.stringify(orderPlace.related_entities));

    if (orderPlace.code && orderPlace.code != 200 || Array.isArray(orderPlace.errors)) {
      throw Error(JSON.stringify(orderPlace));
    }

    if (orderPlace.related_entities && 
        Array.isArray(orderPlace.related_entities) && 
        orderPlace.related_entities[0].type == 'waybill') {
        // console.log('found order related waybill');
        waybillId = orderPlace.related_entities[0].uuid;
    } else {
      const printWaybill = await this.createWaybill(orderPlace.entity.uuid);
      if (printWaybill.requests[0].errors && printWaybill.requests[0].errors.length > 0) {
        throw Error(JSON.stringify(printWaybill));
      }
      waybillId = printWaybill.entity.uuid;
    }

    const orderInfo = await this.getOrderInfo(orderPlace.entity.uuid);
    // console.log('Order Info: ', JSON.stringify(orderInfo));
    // console.log('Order created')

    const courier = await this.createCourierRequest(order, orderPlace.entity.uuid);
    if (courier.errors && courier.errors.length > 0) {
      if (courier.errors[0].code == 'v2_intake_exists_by_date_address') {
        console.log('Courier request already exists for this date and address')
      } else {
        throw Error(JSON.stringify(courier));
      }
    }
    // console.log('Courier req is done')
    
    const id = orderInfo.entity.cdek_number;
    const waybill = await this.getWaybill(waybillId);

    return {
      id,
      waybill,
    };
  }

  async track(trackingId) {

    let orderStatus = null;
    let status = null;
    let data = null;

    const api = `orders?cdek_number=${ trackingId }`;
    const ret = await this._makeRequest(api, 'GET', data);
    
    if (ret.code && ret.code != 200) throw Error(JSON.stringify(ret));

    if (ret.entity && ret.entity.statuses && ret.entity.statuses.length > 0) {
      try {
        status = ret.entity.statuses.shift().code;
        // console.log('Status History:', ret.entity.statuses);
      } catch {
        console.warn('Status code not defined!');
        console.warn(JSON.stringify(ret));
      }
    }
    if ([
      'DELIVERED', // Успешно доставлен и вручен адресату (конечный статус).
    ].indexOf(status) > -1) {
    orderStatus = 'delivered';
    } else if ([
      'INVALID',
    ].indexOf(status) > -1) {
      orderStatus = 'declined';
    } else if ([
      'ACCEPTED',
    ].indexOf(status) > -1) {
      orderStatus = 'confirmed';
    } else if ([
      'CREATED',
    ].indexOf(status) > -1) {
      orderStatus = 'confirmed';
    }  else if ([
      'NOT_DELIVERED', //Покупатель отказался от покупки, возврат в ИМ (конечный статус)
      '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '25', '26', '27', // доп. статусы
    ].indexOf(status) > -1) {
      orderStatus = 'attention';
    }   else {
      orderStatus = 'in_transit';
    }
    return {
      orderStatus,
      status,
    };
  }

  async getRequestsLog() {
    return this.requestsLog;
  }

  async _makeRequest(api, req_method = 'POST', data = null, type = 'json') {
    const url = this.test ? 'https://api.edu.cdek.ru/v2/' : 'https://api.cdek.ru/v2/';

    if (this.jwt == null) {
      const jwt = await this._getToken();
      if (!jwt) throw Error('Cannot get JWT');
      this.jwt = jwt;
      this.tokenRequests = 0;
    }

    const opts = {
      method: req_method,
      body: data === null ? undefined : JSON.stringify(data),
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ this.jwt }`,
      },
    };
    // console.log('Req opts: ', opts)
    const apiURL = url + api;
    const res = await fetch(apiURL, opts);

    if (!res.ok && res.status == 401) {
      this.tokenRequests++;
      console.log('Trying to get a new JWT, attempt #' + this.tokenRequests);
      if (this.tokenRequests > 3) throw Error('Cannot renew JWT');
      await this._sleep(5000);
      this._makeRequest(api, req_method, data, type);
    }

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
    // console.log('*******************');
    // console.log('Req URI: ', apiURL);
    // console.log('Req credencials: ', apiURL, JSON.stringify(opts));
    // console.log('Res: ', JSON.stringify(ret));
    // console.log('*******************');


    return ret;
  }

  async createOrder(order) {
    const rateType = ((order.hasOwnProperty('RateType') && order.RateType.type != undefined ) ? 
    order.RateType.type : order.rate.RateType.type);
    const serviceCode = this._returnServiceCode(rateType);
    let packages = ((order.Packages) ? order.Packages : order.packages);
    packages = this._formatParcel(packages, serviceCode);
    const parcels = {
      ...packages,
      'comment': order.externalComment != '' ? order.externalComment : (order.contents ? order.contents : 'Документы'),
    };
    
    const data = {
      'type': serviceCode == 139 ? 1 : 2, // 1 = Store, 2 = Delivery
      'tariff_code': serviceCode, 
      'number': order.refNo,
      'comment': order.externalComment != '' ? order.externalComment : (order.PackageType.type != 'box' ? 'Документы' : 'Посылка'),
      'from_location': await this._formatAddress(order.addressDetailsFrom),
      'to_location': await this._formatAddress(order.addressDetailsTo),
      'sender': this._formatPerson(order.addressDetailsFrom),
      'recipient': this._formatPerson(order.addressDetailsTo),
      'services': [
      ],
      'packages':  [parcels],
      'print': 'waybill',
      'designerType': 'other',
      'payerType': 'other', 
    };
    const api = 'orders';

    const res = await this._makeRequest(api, 'POST', data);
    if (res.code && res.code != 200) throw Error(JSON.stringify(res));
    // console.log(res.requests[0].state)
    // if(res.requests[0].state == 'INVALID') {
    //   console.warn('Order Creation ERROR: ');
    //   console.warn('Req: ', JSON.stringify(data));
    //   console.warn('Resp: ', JSON.stringify(res));
    // }

    return res;
  }

  async createCourierRequest(order, uuid) {

    const isToday = moment().hours() < 17;

    const data = {
      'order_uuid': uuid,
      'intake_date': isToday ? moment(order.pickupTime).format('YYYY-MM-DD') : moment(order.pickupTime).add(1, 'days').format('YYYY-MM-DD'),
      'intake_time_from': isToday ? moment().format('HH:mm') : '09:00',
      'intake_time_to': '18:00',
      'comment': order.externalComment,
      'need_call': true
    }

    const api = 'intakes';
    const res = await this._makeRequest(api, 'POST', data);
    if (res.requests[0].errors && res.requests[0].errors.length > 0) throw Error(JSON.stringify(res));
    // if (res.errors && res.errors.length > 0) {
    //   console.warn('Courier request ERROR: ');
    //   console.warn('Req: ', JSON.stringify(data));
    //   console.warn('Resp: ', JSON.stringify(res));
  
    // }

    return(res);
  }

  async cancelCourierRequest(uuid) {
    const data = null;
    const api = `intakes/${ uuid }`;
    const res = await this._makeRequest(api, 'DELETE', data);
    if (res.requests[0].errors && res.requests[0].errors.length > 0) throw Error(JSON.stringify(res));

    return(res);

  }

  async getOrderInfo(uuid) {
    let sdekId = null;
    const data = null;
    let counter = 0;
    let ret;
    const api = `orders/${ uuid }`;

    while (!sdekId && counter < 3) {
      counter++;
      console.warn('OrderInfo attempt #', counter);
      await this._sleep(5000);
      ret = await this._makeRequest(api, 'GET', data);
      if (ret != undefined && 'entity' in ret) sdekId = ret.entity.cdek_number;
      console.log('sdekId: ', sdekId);
    } 

    if(counter == 3) {
      console.warn('Error due to the order creation! Service responce: ');
      throw Error (JSON.stringify(ret));
    }
    // if (ret.requests && Array.isArray(ret.requests) && Array.isArray(ret.requests[0].errors) && ret.requests[0].errors.length > 0 ) throw Error(JSON.stringify(ret));

    return (ret);
  }

  async getOrderStatuses(trackingId) {
    let data = null;

    const api = `orders?cdek_number=${ trackingId }`;
    const ret = await this._makeRequest(api, 'GET', data);
    // if (ret?.requests && Array.isArray(ret.requests) && Array.isArray(ret.requests[0]?.errors) && ret.requests[0].errors.length > 0 ) throw Error(JSON.stringify(ret));

    return(ret.entity.statuses);    
  }

  async createWaybill(uuid) {
    const data = {
      'orders': [
          {
            'order_uuid': uuid,
          }
      ],
      'copy_count': 2
    }
    const docType = config.type == 'bestsender' ? 'orders' : 'barcodes'
    // const docType = 'orders';
    
    const api = `print/${docType}`;
    console.log('create wbill api ', api);
    const ret = await this._makeRequest(api, 'POST', data);
    if (ret.requests && Array.isArray(ret.requests) && Array.isArray(ret.requests[0].errors) && ret.requests[0].errors.length > 0 ) throw Error(JSON.stringify(ret));

    return(ret);
  }

  async getWaybill (uuid) {
    const data = null;
    // const docType = config.type == 'bestsender' ? 'orders' : 'barcodes'
    const docType = 'orders';
    const api = `print/${docType}/${ uuid }`;
    console.log('wbill api ', api);
    const ret = await this._makeRequest(api, 'GET', data);
    if (ret.requests && Array.isArray(ret.requests) && Array.isArray(ret.requests[0].errors) && ret.requests[0].errors.length > 0 ) throw Error(JSON.stringify(ret));

    let res = await this._makeRequest(api + '.pdf', 'GET', data, 'blob');

    return Buffer.from(await res.arrayBuffer()).toString('base64');
  }

}

module.exports = SdekAPI;