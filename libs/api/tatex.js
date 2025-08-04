const config = require('../../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

const fetch = require('isomorphic-unfetch');


class TatexAPI {
    constructor(args = {}) {
        const {
            apiKey = config.tatex.apiKey,
            test = config.tatex.test,
        } = args;

    this.apiKey = apiKey;
    this.test   = test;
    this.requestsLog = [];
    }
    _sleep = (ms) => new Promise(r => setTimeout(r, ms));

    _formatParcel = (packages) => {

        return (
            {
            'width':  +(packages.reduce((a, p) => Math.max(a, p.width), 0)),
            'height': +(packages.reduce((a, p) => Math.max(a, p.height), 0)),
            'length': +(packages.reduce((a, p) => a + (p.depth * p.quantity), 0)),
            'weight': +(packages.reduce((a, p) => a + (p.weight * p.quantity), 0)),
            }
        );
    }

    _formatPhoneNumber = (phone) => {
        let res = phone.trim().replace(/\D+/g, '');
        if (res[0] != '7') {
            if (res.slice(0, 1) == '80') res = '7' + res.slice(2);
        }

        return(`+${res.slice(0,1)} (${res.slice(1,4)}) ${res.slice(4,7)}-${res.slice(7)}`);
    };

    _returnPackageType = (packageType) => {
        if (packageType == 'documents') return ('document');
        if (packageType == 'box') return ('package');

        throw Error('Unsupported package type ', packageType);
    }

    async _getGeography(order) {
        const data = null;
        const api = 'api/countries/';
        const res = await this._makeRequest(api, 'GET', data);
        if (res.status && res.status != 200) throw Error(JSON.stringify(res));
    
        return ({
            'countryFrom': res[order.CountryFrom.name.ru],
            'countryTo': res[order.CountryTo.name.ru],
        });
    }

    async _getOrderInfo(uuid) {
        const data = null;
        const api = `api/orders/${ uuid }/`;
        const res = await this._makeRequest(api, 'GET', data);

        return res;
    }

    async getWaybill(uuid) {
        const data = null;
        this._sleep(5000);
        let counter = 0;
        let orderInfo = await this._getOrderInfo(uuid);

        while (!orderInfo.waybill_url && counter <= 3) {
            this._sleep(5000);
            orderInfo = await this._getOrderInfo(uuid);
            counter++;
        }

        if (!orderInfo.waybill_url) {
            throw Error('No waybill getted');
            // console.warn('Cannot get waybill');
            // return null;
        } else {
            const api = `/static/files/${ uuid }/%D0%9D%D0%B0%D0%BA%D0%BB%D0%B0%D0%B4%D0%BD%D0%B0%D1%8F.pdf`;
            const res = await this._makeRequest(api, 'GET', data, 'blob');
    
            return Buffer.from(await res.arrayBuffer()).toString('base64');
        } 
    }

    async create(order) {
        const ret = await this.createOrder(order);
        const id = ret.trackcode;
        const waybill = await this.getWaybill(id);

        return {
            id,
            waybill
        };
    }

    async getRequestsLog() {
        return this.requestsLog;
    }

    async _makeRequest(api, method = 'POST', data = null, type = 'json') {
        const url = 'https://tatex.kz/';

        const opts = {
            method: method,
            body: data === null ? undefined : JSON.stringify(data),
            headers: {
            'Content-Type': 'application/json',
            'X-API-KEY': this.apiKey
            },
        };
        const apiURL = url + api;
        const res = await fetch(apiURL, opts);
        if (![200, 201].includes(res.status)) {
            console.warn('ERROR!');
            console.warn('Request to URI ', apiURL);
            console.warn('Request options ', opts);
            console.warn('status: ', res.status);
            console.warn('status description: ', res.statusText);
            throw Error('Bad responce: ', JSON.stringify(res.body));
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

        return ret;
    }

    async getRate(order) {
        const api = `api/tariff/calculate/`;
        const packages = ((order.Packages) ? order.Packages : order.packages);
        const parcel = this._formatParcel(packages);
        const data = {
            'typePackage': this._returnPackageType(order.PackageType.type),
            'fromCity': order.addressDetailsFrom.city,
            'whereCity': order.addressDetailsTo.city,
            'fromCountry': order.addressDetailsFrom.country,
            'whereCountry': order.addressDetailsTo.country,
            'weight': parcel.weight,
        };
        const res = await this._makeRequest(api, 'POST', data);

        return (
            {
                'price': res.tariff,
                'extra': {
                    'deliveryTime': {
                        'from': null,
                        'to': null
                    },
                    'code': null,
                    'name': null,
                },
            }
        );
    }

    async track(id) {
        let orderStatus = null;
        let status = null;

        const ret = await this._getOrderInfo(id);
        if (ret && Array.isArray(ret.events) && ret.events.length > 0) {
            status = ret.events.pop().dhlCode;
            //console.log('status:', JSON.stringify(status));

            if ([].indexOf(status) > -1) {
            //  orderStatus = 'confirmed'; // needs to be commented to keep in translit when not delivered into hands
            } else if (['OK'].indexOf(status) > -1) {
                orderStatus = 'delivered';
            } else if (['SS'].indexOf(status) > -1) {
                orderStatus = 'attention';
            // } else if (['SA',].indexOf(status) > -1) {
            //  orderStatus = 'confirmed';
            } else {
                orderStatus = 'in_transit';
            }
        }
        console.log('Tatex tracking: ', {orderStatus, status});

        return {
            orderStatus,
            status,
        };
    }

    async createOrder(order) {
        const api = 'api/orders/';
        const packages = ((order.Packages) ? order.Packages : order.packages);
        const parcel = this._formatParcel(packages);
        const data = {
            ...parcel,
            'promo': '',
            'typePackage': this._returnPackageType(order.PackageType.type),
            'sendersName': this.test ? 'Test' : `${order.addressDetailsFrom.firstName} ${order.addressDetailsFrom.lastName}`,
            'sendersCompany': this.test ? 'Test' : order.addressDetailsFrom.companyName != '' ? order.addressDetailsFrom.companyName : 'Частное лицо',
            'recipientName': this.test ? 'Test' : `${order.addressDetailsTo.firstName} ${order.addressDetailsTo.lastName}`,
            'recipientCompany': this.test ? 'Test' : order.addressDetailsTo.companyName != '' ? order.addressDetailsTo.companyName : 'Частное лицо',
            'dataSend': moment(order.pickupTime).format('DD/MM/YYYY'),
            'sendersTel': this._formatPhoneNumber(order.addressDetailsFrom.phone),
            'recipientTel': this._formatPhoneNumber(order.addressDetailsTo.phone),
            'fromCountry': order.addressDetailsFrom.country,
            'postIndexSender': order.addressDetailsFrom.postCode,
            'fromCity': order.addressDetailsFrom.city,
            'sendersAddress': `${ order.addressDetailsFrom.addressLine1 } ${ order.addressDetailsFrom.addressLine2 != '' ? ', ' + order.addressDetailsFrom.addressLine2 : '' }`,
            'whereCountry': order.addressDetailsTo.country,
            'postIndexRecipient': order.addressDetailsTo.postCode,
            'whereCity': order.addressDetailsTo.city,
            'recipientAddress': `${ order.addressDetailsTo.addressLine1 } ${ order.addressDetailsTo.addressLine2 != '' ? ', ' + order.addressDetailsTo.addressLine2 : '' }`,
            'email':  'info@bestsender.kz',//order.addressDetailsFrom.email,
            'comment': order.contents ? order.contents : (order.PackageType.type != 'box' ? 'Документы' : 'Посылка'),
            'instruction':  this.test ? 'Test' : order.externalComment,
            'printNeed': true,
        };
        const res = await this._makeRequest(api, 'POST', data);

        return res;
    }
}

module.exports = TatexAPI;
