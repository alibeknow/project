const config = require('../../config/app');
const _round = require('lodash/round');
const moment = require('moment-timezone');
const md5 = require('md5');
const cache = require('../cache');

moment.tz.setDefault(config.timezone);

const soap = require('strong-soap').soap;

const util = require('util');
const soapCreateClientAsync = util.promisify(soap.createClient);


class DpdAPI {
  constructor(args = {}) {
    const { userNum = null, apiKey = null, test = true } = args;

    this.userNum = userNum,
    this.apiKey = apiKey,
    this.test = test;

    this.requestsLog = [];
  }

  async create(order) {
    return; // no-order mode patch

    let data = null;
    let id = null;  //res.return[0].orderNum

    try {
      const json = await this.createOrder(order);
      // console.log('json:', json)
      if (json.return[0].status != 'OK') {
          console.log('DPD api server returned error!');
          throw Error(JSON.stringify(json.return));
      }
      id = json.return[0].orderNum;
    } catch (err) {
      // console.log('Order Creation Error!', err.root.Envelope.Body.Fault)
      console.log('Order Creation Error!', err)
    }

    try {
        const json = await this.getWaybill(id);
        data = json.return.file;
    } catch (err) {
        if (err.root) {
            console.warn('Getting Waybill Error!', err.root.Envelope.Body.Fault)
        } else {
            console.warn('Server connection problems due to the getting waybill');
            console.warn(err);
        }
    }

    return {
      id,
      waybill: data,
    }
  }

  async track(id) {
    let orderStatus = null;
    let status = null;
    try{
        const json = await this._getDeliveryStatus(id);
        // console.log('json:', JSON.stringify(json));
        if (json.return.resultComplete) {
            status = json.return.states.pop().newState;
        }

        if (['Delivered'].indexOf(status) > -1) {
            orderStatus = 'delivered';
        } else if ([
                'NotDone',
                'Lost',
                'Problem',
                'ReturnedFromDelivery',
                'NewOrderByDPD',
                'NewOrderByClient',
            ].indexOf(status) > -1) {
            orderStatus = 'attention';
        } else {
            orderStatus = 'in_transit';
        }
        
    } catch(err) {
        console.log('Tracking Error!', err.root.Envelope.Body.Fault)
    }

    return {
      orderStatus,
      status,
    };
  }

  async _makeRequest(api, method, args, needs_caching = false, cacheTime = (3600000 * 24 * 30)) {
    const url = `http://ws${ this.test ? 'test' : '' }.dpd.ru/services/`;

    // console.log('url: ', url + api + '?wsdl');

    let cache_key;
    if (needs_caching) {
      cache_key = 'api_dpd_' + md5(api + '-' + method + '-' + JSON.stringify(args));

      const cache_res = await cache.get(cache_key, cacheTime);
      if (cache_res !== false) {
        // console.warn('Cached Responce read with key: ' + cache_key);
        //console.warn('Cached Responce: ' + cache_res);

        let res = JSON.parse(cache_res);
        const { result, envelope, soapHeader } = res;

        this.requestsLog.push({
          date: new Date(),
          req: {
            api,
            method,
            args,
          },
          res: {
            soapHeader,
            envelope,
            result,
          },
          from_cache: true,
        });

        return result;
      } else {
        console.warn('Cached Responce Not Found :(');
      }
    }

    const client = await soapCreateClientAsync(url + api + '?wsdl');

    try {
      const { result, envelope, soapHeader } = await client[method](args);

      this.requestsLog.push({
        date: new Date(),
        req: {
          api,
          method,
          args,
        },
        res: {
          soapHeader,
          envelope,
          result,
        },
        from_cache: false,
      });

      if (needs_caching) {
        let res = { result, envelope, soapHeader };
        res = JSON.stringify(res);
        await cache.set(cache_key, res);
        console.warn('Responce cached with key: ' + cache_key);
      }

      return result;
    } catch (err) {
      console.warn('Error happened connecting to Dpd soap!');
      console.warn(JSON.stringify(err));
      // throw err;
    }
  }

  async getRequestsLog() {
    return this.requestsLog;
  }

  async createOrder(order) {

    const packages = ((order.Packages) ? order.Packages : order.packages);
    const parcel = this._formatParcel(packages);
    let serviceInsurance = false;
    const cityAddrFrom = await this._formatAddress(order.addressDetailsFrom);
    const cityAddrTo = await this._formatAddress(order.addressDetailsTo);

    if (order.OrderServices.findIndex((s) => s.action == 'insurance') > -1 && order.declaredValue > 0) {
      serviceInsurance = true;
    }
  
    const args = {
        orders:{
          auth: {
            clientNumber: this.userNum,
            clientKey: this.apiKey,
          },
          header: {
            datePickup: moment(order.pickupTime).format('YYYY-MM-DD'),
            payer: this.userNum,
            senderAddress: {
              ...cityAddrFrom,
              instructions: `Адр.: ${cityAddrFrom.addressString}; коммент.: ${order.externalComment}`,
            },
            pickupTimePeriod: '9-18',
          },
          order: {
            orderNumberInternal: order.refNo + 1,
            serviceCode: this._returnServiceCode(order.RateType.type, config.type),
            serviceVariant: 'ДД', // door2door
            ...parcel,
            cargoRegistered: serviceInsurance,
            cargoValue: order.declaredValue,
            cargoCategory: order.contents,
            receiverAddress: {
              ...cityAddrTo,
              instructions: `Адр.: ${cityAddrTo.addressString}; коммент.: ${order.externalComment}`,
            },
          }
        }
    };
    // console.log(JSON.stringify(args));
    const res = await this._makeRequest('order2', 'createOrder', args);
    
    return res;
  }

  async getWaybill(id) {
    const args = {
      request: {
        auth: {
          clientNumber: this.userNum,
          clientKey: this.apiKey,
        },
        orderNum: id,
      }
    };

    const res = await this._makeRequest('order2', 'getInvoiceFile', args);
    
    return (res);
  };

  async getRate(order){
    console.log('getRate running...');
    const start = new Date();

    let ratesList = null;

    const rateType = ((order.hasOwnProperty('RateType') && order.RateType.type != undefined ) ? 
      order.RateType.type : order.rate.RateType.type);

    const isDeliveryOutsideECU = !this._isECUDelivery(order.addressDetailsFrom, order.addressDetailsTo);
    const calcMethod = isDeliveryOutsideECU ? 'getServiceCostInternational' : 'getServiceCost2';

    let packages = ((order.Packages) ? order.Packages : order.packages);
    const parcel = this._formatParcel(packages, isDeliveryOutsideECU);

    const cityFrom = await this._getCityInfo(order.addressDetailsFrom);
    const cityTo = await this._getCityInfo(order.addressDetailsTo);

    if (isDeliveryOutsideECU) {
      additionalPart = {
        insurance: false
      }
    }

    if (cityFrom === null || cityTo === null) return null;

    const args = {
      request: {
        auth: {
          clientNumber: this.userNum,
          clientKey: this.apiKey,
        },
        pickup: await this._formatAddress(order.addressDetailsFrom, isDeliveryOutsideECU),
        delivery: await this._formatAddress(order.addressDetailsTo, isDeliveryOutsideECU),
        selfPickup: false,
        selfDelivery: false,
        ...parcel,
        serviceCode: this._returnServiceCode(rateType, config.type),
        declaredValue: 0,
      }
    }

    const res = await this._makeRequest('calculator2', calcMethod, args);
    // const res = await this._makeRequest('calculator2', 'getServiceCost2', args); //calc by parcel dimmensions
    if (res && res.hasOwnProperty('return')) {
      ratesList = res.return.map((rate) => this._formatRate(rate));
      console.log('ratesList: ', ratesList);

    } else {
      console.warn('Error due the getting responce: ', res);
      console.warn('Request: ', JSON.stringify(args));
    }

    // console.warn('rateType', rateType, 'serviceCode => ', this._returnServiceCode(rateType, config.type));
    // console.log('isOutsideECU?: ', isDeliveryOutsideECU);
    // console.log('calcMethod: ', calcMethod);
    // console.log('parcel', parcel);
    // console.log('args: ', JSON.stringify(args));
    // console.log('ratesList: ', JSON.stringify(ratesList));

    let stop = new Date();
    let runningTime = (stop - start) / 1000;
    console.log('time spent: ', runningTime);

    return ratesList; 
  }

  async _getCitiesOf(countryCode = 'RU') {
    const args = {
      request: {
        auth: {
          clientNumber: this.userNum,
          clientKey: this.apiKey,
        },
        countryCode: countryCode
      }
    };

    const res = await this._makeRequest('geography2', 'getCitiesCashPay', args, true, 3600000 * 1);

    return(res.return);
  }

  async _getCityInfo(address) {
    const cities = await this._getCitiesOf(address.countryCode);
    const city = cities.find(city => city.cityCode === address.kladrCode);

    if (city === undefined) return null;
    
    return city;
  }

  _isECUDelivery = (addressFrom, addressTo) => {
    const ECU = ['RU', 'BY', 'KZ', 'KG', 'AM']; // Eurasian Customs Union countries
    if (ECU.includes(addressFrom.countryCode) && ECU.includes(addressTo.countryCode))
      return true;

    return false
  }

  async _formatAddress(address, isDeliveryOutsideECU = null) {
    let res = {};

    if (isDeliveryOutsideECU === null) { //order
      let addressString = (address.addressLine1 + ', ' + address.addressLine2).trim();
      const street = this._returnStreet(addressString);
      const countryName = address.country == 'Российская Федерация' ? 'Россия' : address.country;

      res = {
        name: address.companyName ? address.companyName : 'Частное лицо',
        countryName: countryName,
        index: address.postCode,
        region: address.region,
        city: address.city,
        street: street.name,
        streetAbbr: street.abbreviation,
        house: this._returnHouse(addressString),
        contactFio: address.firstName + ' ' + address.lastName,
        contactPhone: address.phone,
        addressString: addressString,
      }

    } else if (isDeliveryOutsideECU === false) { //rate inside ECU
      const cityInfo = await this._getCityInfo(address);
      res = {
        countryCode: cityInfo.countryCode,
        cityId: cityInfo.cityId,
      }

    } else if (isDeliveryOutsideECU === true) { // international rate
      res={
        countryName: address.country,
        cityName: address.city,
      }
    }

    return res;
  }

  _formatParcel = (packages, calcByDimensions = null) => {
    let parcel = null;

    if (calcByDimensions === null) { //order
      parcel = {
        cargoNumPack: packages.reduce((a, p) => a + p.quantity, 0),
        cargoWeight:  packages.reduce((a, p) => a + p.weight, 0),
        cargoVolume: (packages.reduce((a, p) => a + (p.height * p.width * p.depth * p.quantity), 0))/1000000,
      }
    } else if (calcByDimensions === false) {  //rate inside ECU
      parcel = {
        weight:   packages.reduce((a, v) => a + v.weight, 0),
        volume:  (packages.reduce((a, v) => a + (v.height * v.width * v.depth * v.quantity), 0))/1000000
      }
    } else if (calcByDimensions === true) { //international rate
      parcel = {
        width:   packages.reduce((a, p) => Math.max(a, p.width), 0),
        height:  packages.reduce((a, p) => Math.max(a, p.height), 0),
        length:  packages.reduce((a, p) => a + (p.depth * p.quantity), 0),
        weight:  packages.reduce((a, p) => a + (p.weight * p.quantity), 0),
      }
    }

    return parcel
  }

  async _getDeliveryStatus(id) {
    const args = {
      request: {
        auth: {
          clientNumber: this.userNum,
          clientKey: this.apiKey,
        },
        dpdOrderNr: id,
        pickupYear: moment().format('YYYY'),
      }
    };
    const res = await this._makeRequest('tracing', 'getStatesByDPDOrder', args);
    
    return res;
  }

  _returnServiceCode = (rateType, configType = 'bestsender') => {
    if (configType == 'bestsender') {
      switch (rateType) {
        case 'express':
          return 'BZP';

        case 'economy':
          return 'ECU';

        case 'standard':
          return 'PCL';
      }
    } else if (configType == 'packon') {
      switch (rateType) {
        case 'super_express':
          return 'BZP';

          case 'daily':
            return 'DAY';

        case 'express':
          return 'NDY';

        case 'economy':
          return 'ECN';

        case 'standard':
          return 'CUR';
      }
    }
    console.warn('!DEBUG: Config Type', configType, '& Rate Type ',  rateType)
    throw Error('Service Code not found for parameters above!');
  }

  _returnStreet = (address) => {
    let res = null;
    let streetAbbr = null;
    let addr = address.toLowerCase();
    let start = [
        'ул.',
        'улица',
        'ул-ца',
        ' ул ',
        ' ул;',
        ' у лица ',
        ' улеца ',
        'улеца ',
        'пр.',
        'пр-т',
        'просп.',
        'проспект',
        'пр-кт',
        'п-к',
        'пкт ',
        'б.',
        'бул.',
        'бульв.',
        'б-р',
        'бульвар',
        'пер.',
        'блвр',
        'бул-р',
    ];
    let end = [
        ',',
        'д.',
        ' д:',
        ' д;',
        ' дом.',
        ' дом ',
        '1',
        '2',
        '3',
        '4',
        '5',
        '6',
        '8',
        '9',
        '0',
    
    ]
    let addrParts = [start, end];
    let separator = null;
    let position = 1;

    const _returnSeparator = (separators, address) => {
        for (separator of separators) {
            if(address.indexOf(separator) > -1) {
                return separator;
            }
        };
        throw Error('Separator not found!');
    }
    
    const _trimStreetName = (street) => {
    
        street = street.replace(/[.,%]/g, '').trim(); // replasing spaces and punctuation marks
        let streetParts = street.split(' ');
        let length = streetParts.length;
    
        if (!isNaN(streetParts[length -1])) // replasing last part of the streetname if it's numeric
            streetParts.pop();
    
        return(streetParts.join(' '));
    }

    addrParts.forEach((arr) => {
        try  {
            separator = _returnSeparator(arr, addr);
            addr = addr.split(separator)[position];
            if (start.includes(separator)) 
              streetAbbr = separator;
        } catch {
            console.log(`Separator not found at the ${ position ? 'start' : 'end' } of the address...`);
        }
        position -= 1;
    });
    res = {
      name: _trimStreetName(addr),
      abbreviation: streetAbbr
    };
    
    return res;
  }

  _returnHouse = (address) => {
    let house = 0;
    address = address.toLowerCase();
    let separators = [
      'д.',
      ' д:',
      ' д;',
      ' дом.',
      ' дом ',
      'д-м',
    ];
    for (let separator of separators) {
      if(address.indexOf(separator) > -1) {
        try{
            house = address.split(separator)[1].split(' ')[0].replace(/[.,%]/g, '');
            return(house);
        } catch {
            console.warn('House was not found in the address string!')
        }
      }
    }
  }

  _formatRate = (rate) => {
    let res = null;
    if (rate.hasOwnProperty('cost') && !!rate.cost)
      res =  {
        'price': rate.cost,
        'extra': {
          'deliveryTime': {
            'from': rate.days,
            'to': rate.days
          },
          'code': rate.serviceCode,
          'name': rate.serviceName,
        },
      };

    return(res);
  }
}

module.exports = DpdAPI;