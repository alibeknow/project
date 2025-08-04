const config = require('../../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

const fetch = require('isomorphic-unfetch');
const convert = require('xml-js');
const cyrillicToTranslit = require('cyrillic-to-translit-js');
const translatte = require('translatte');
const translated = require('./shared/cities.json');

function translit(str) {
  return cyrillicToTranslit().transform(str);
}

function isASCII(str) {
  for (let i = 0; i < str.length; i++) {
    if (str.charCodeAt(i) > 127) return false;
  }
  return true;
}

function trim(str, chars) {
  return str.split(chars).filter(Boolean).join(chars);
}

async function translate(city) {
  let ret = null;
  if(translated[city] != undefined) {
    ret = translated[city];
  } else {
    let res = await translatte(city, { from: 'ru', to: 'en' });
    ret = res.text;
  }
  
  return ret;
}


class AseAPI {
  constructor(args = {}) {
    const { authorizationCode = '', password = '', test = true } = args;
      this.authorizationCode = authorizationCode;
      this.password = password;
      this.test = test;

      this.requestsLog = [];
  }
  
  async create(order) {
    let id = null, data = null;

    const openBasketRes = await this.openBasket();
    if (openBasketRes['soap:Envelope']['soap:Body']['OpenBasketResponse']['OpenBasketResult']['Status']['_text'] != 'Ok')
      throw Error(openBasketRes['soap:Envelope']['soap:Body']['OpenBasketResponse']['OpenBasketResult']['StatusDescription']['_text']);
    
    const basketCode = openBasketRes['soap:Envelope']['soap:Body']['OpenBasketResponse']['OpenBasketResult']['BasketCode']['_text']; 
    
    const sendShipmentRes = await this.sendShipment(basketCode, order); 
    if (sendShipmentRes['soap:Envelope']['soap:Body']['SendShipmentResponse']['SendShipmentResult']['Status']['_text'] != 'Ok')
      throw Error(sendShipmentRes['soap:Envelope']['soap:Body']['SendShipmentResponse']['SendShipmentResult']['StatusDescription']['_text']);
    id = sendShipmentRes['soap:Envelope']['soap:Body']['SendShipmentResponse']['SendShipmentResult']['CWBCode']['_text'];
    data = sendShipmentRes['soap:Envelope']['soap:Body']['SendShipmentResponse']['SendShipmentResult']['WaybillDocument']['_text'];

    const closeBasketRes = await this.closeBasket(basketCode);
    if (closeBasketRes['soap:Envelope']['soap:Body']['CloseBasketResponse']['CloseBasketResult']['Status']['_text'] != 'Ok')
      throw Error(closeBasketRes['soap:Envelope']['soap:Body']['CloseBasketResponse']['CloseBasketResult']['StatusDescription']['_text']);

    return {
      id,
      waybill: data,
    };
  }

  async track(id) {
    let orderStatus = null;
    let status = null;
    let statusCodes = [];

    const ret = await this.getTracking(id);
    console.log(JSON.stringify(ret));
    if (ret['soap:Envelope']['soap:Body']['GetShipmentHistoryResponse']['GetShipmentHistoryResult']['Status']) {
      if (ret['soap:Envelope']['soap:Body']['GetShipmentHistoryResponse']['GetShipmentHistoryResult']['Status']['_text'] != 'Ok')
        throw Error(ret['soap:Envelope']['soap:Body']['GetShipmentHistoryResponse']['GetShipmentHistoryResult']['StatusDescription']['_text']);
    }

    const list = ret['soap:Envelope']['soap:Body']['GetShipmentHistoryResponse']['GetShipmentHistoryResult']['History']['history'];
    //console.log(JSON.stringify(list));
    if (Array.isArray(list)) {

      statusCodes = Array.from(list, (x) => x['ActionCode']['_text']);
      const deliveredStatuses = ['40-100', '41-100', '70-100', '78-100', '80-100', '84-100', '94-100', '98-100', '35-100'];
      const delivered = deliveredStatuses.filter(x => statusCodes.includes(x));
      if (!!delivered.length) {
        console.warn(`Seems like order ${id} is delivered =) `);
  
        return ({
          status: delivered.pop(),
          orderStatus: 'delivered',
        });
      }

      status = list.pop()['ActionCode']['_text'];
      if (['dSD', '0-10', '0-17', '35-40'].indexOf(status) > -1) {
        orderStatus = 'confirmed';
      } else if (['40-101'].indexOf(status) > -1) {
        orderStatus = 'returned';
      } else if (['44-102'].indexOf(status) > -1) {
        orderStatus = 'destroyed';
      //} else if ([''].indexOf(status) > -1) {
      //  orderStatus = 'attention';
      } else {
        orderStatus = 'in_transit';
      }
    }

    return {
      orderStatus,
      status,
    };
  }

  _encodeXMLParam(s) {
    return String(s).replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&apos;');
  }

  _decodeXMLParam() {
    return String(s).replace(/&apos;/g, "'")
                    .replace(/&quot;/g, '"')
                    .replace(/&gt;/g, '>')
                    .replace(/&lt;/g, '<')
                    .replace(/&amp;/g, '&');
  }

  async _validateCityProvince(type, str) {
    if (type == 'city') {
      if (str != '' && !isASCII(str)) {
        str = trim(str, 'г.');
        str = await translate(str.trim());
        str = trim(str, '.');
      }
    } else if (type == 'province') {
      if (str != '' && !isASCII(str)) {
        str = await translate(str);
      }
    }

    return str;
  }

  async _makeRequest(url, xml) {
    const res = await fetch(url, {
      method: 'POST',
      body: xml,
      headers: {
        'Content-Type': 'text/xml',
      },
    });

    const text = await res.text();
    // console.log('url: ' + url);
    // console.log('req: ' + xml);
    // console.log('res: ' + text);

    this.requestsLog.push({
      date: new Date(),
      req: {
        url,
        xml,
      },
      res: text,
    });

    return text;
  }

  async getRequestsLog() {
    return [];
  }

  async openBasket() {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <soap:Body>
      <OpenBasket xmlns="http://api.ase.com.tr/">
      <AuthorizationCode>${this._encodeXMLParam(this.authorizationCode)}</AuthorizationCode>
      <Password>${this._encodeXMLParam(this.password)}</Password>
      </OpenBasket>
      </soap:Body>
      </soap:Envelope>`;
    
    const url = 'http://api.ase.com.tr/Connect/Shipping/SendManifest.asmx?op=OpenBasket';
    let res = await this._makeRequest(url, xml);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    return res;
  }
  
  async sendShipment(basketCode, order) {
    const senderCity = await this._validateCityProvince('city', order.addressDetailsFrom.city);
    const senderProvince = await this._validateCityProvince('province', order.addressDetailsFrom.province);
    const recipientCity = await this._validateCityProvince('city', order.addressDetailsTo.city);
    const recipientProvince = await this._validateCityProvince('province', order.addressDetailsTo.province);

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <soap:Body>
      <SendShipment xmlns="http://api.ase.com.tr/">
      <shipment>
      <AuthorizationCode>${this._encodeXMLParam(this.authorizationCode)}</AuthorizationCode>
      <Password>${this._encodeXMLParam(this.password)}</Password>
      <BasketCode>${this._encodeXMLParam(basketCode)}</BasketCode>
      <ActionCode>A</ActionCode>
      <CWBCode/>
      <ReferenceCode>${this._encodeXMLParam(order.refNo)}</ReferenceCode>
      <SenderName>${this._encodeXMLParam(translit(order.addressDetailsFrom.companyName ? order.addressDetailsFrom.companyName  : 'Private person'))}</SenderName>
      <SenderContactPerson>${this._encodeXMLParam(translit(order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName))}</SenderContactPerson>
      <SenderAddress>${this._encodeXMLParam(translit(order.addressDetailsFrom.addressLine1 + (order.addressDetailsFrom.addressLine2 ? ` ${order.addressDetailsFrom.addressLine2}`: '') + (order.externalComment ? ' | ' + order.externalComment : '')))}</SenderAddress>
      <SenderCity>${this._encodeXMLParam(senderCity)}</SenderCity>
      <SenderState>${this._encodeXMLParam(senderProvince)}</SenderState>
      <SenderPostCode>${this._encodeXMLParam(order.addressDetailsFrom.postCode)}</SenderPostCode>
      <SenderCountryCode>${this._encodeXMLParam(order.addressDetailsFrom.countryCode)}</SenderCountryCode>
      <SenderContactEmail/>
      <SenderContactPhone>${this._encodeXMLParam(order.addressDetailsFrom.phone.replace(/[^\d\s]/gi, '').slice(0,15))}</SenderContactPhone>
      <SenderContactMobile/>
      <SenderTaxId/>
      <RecipientName>${this._encodeXMLParam(translit(order.addressDetailsTo.companyName ? order.addressDetailsTo.companyName : 'Private person'))}</RecipientName>
      <RecipientContactPerson>${this._encodeXMLParam(translit(order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName))}</RecipientContactPerson>
      <RecipientAddress>${this._encodeXMLParam(translit(order.addressDetailsTo.addressLine1 + (order.addressDetailsTo.addressLine2 ? ' ' + order.addressDetailsTo.addressLine2 : '')))}</RecipientAddress>
      <RecipientCity>${this._encodeXMLParam(recipientCity)}</RecipientCity>
      <RecipientState>${this._encodeXMLParam(recipientProvince)}</RecipientState>
      <RecipientPostCode>${this._encodeXMLParam(order.addressDetailsTo.postCode)}</RecipientPostCode>
      <RecipientCountryCode>${this._encodeXMLParam(order.addressDetailsTo.countryCode)}</RecipientCountryCode>
      <RecipientContactEmail/>
      <RecipientContactPhone>${this._encodeXMLParam(order.addressDetailsTo.phone.replace(/[^\d\s]/gi, '').slice(0,15))}</RecipientContactPhone>
      <RecipientContactMobile/>
      <OrderTotalValue>${this._encodeXMLParam(order.declaredValue)}</OrderTotalValue>
      <OrderCurrencyCode>KZT</OrderCurrencyCode>
      <ParcelCount>${order.Packages.map((p) => p.quantity).reduce((a, v) => a + v, 0)}</ParcelCount>
      <ServiceCode>KRY</ServiceCode>
      <Type/>
      <DeliveredDutyType>DDU</DeliveredDutyType>
      <CODValue>0</CODValue>
      <CODCurrencyCode/>
      <WaybillDocument>A4</WaybillDocument>
      <InvoiceDocument>No</InvoiceDocument>
      <Items>
      <Item>
      <ParcelNumber>1</ParcelNumber>
      <ArticleCode>${this._encodeXMLParam(order.refNo)}</ArticleCode>
      <ProductBarcode>${this._encodeXMLParam(order.refNo)}</ProductBarcode>
      <HSCode></HSCode>
      <Description>${'Zabor: ' + moment(order.pickupTime).format('YYYY-MM-DD') + ', ' + (order.contents ? this._encodeXMLParam(translit(order.contents)).substring(0,49) : 'Documents')}</Description>
      <Quantity>${order.Packages.map((p) => p.quantity).reduce((a, v) => a + v, 0)}</Quantity>
      <UnitWeight>${order.Packages.reduce((a, v) => a + (v.weight * v.quantity), 0)}</UnitWeight>
      </Item>
      </Items>
      </shipment>
      </SendShipment>
      </soap:Body>
      </soap:Envelope>`;
    // console.log(xml);
    
    const url = 'http://api.ase.com.tr/Connect/Shipping/SendManifest.asmx?op=SendShipment';
    let res = await this._makeRequest(url, xml);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    return res;
  }

  async closeBasket(basketCode) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <soap:Body>
      <CloseBasket xmlns="http://api.ase.com.tr/">
      <AuthorizationCode>${this._encodeXMLParam(this.authorizationCode)}</AuthorizationCode>
      <Password>${this._encodeXMLParam(this.password)}</Password>
      <BasketCode>${this._encodeXMLParam(basketCode)}</BasketCode>
      </CloseBasket>
      </soap:Body>
      </soap:Envelope>`;

    const url = 'http://api.ase.com.tr/Connect/Shipping/SendManifest.asmx?op=CloseBasket';
    let res = await this._makeRequest(url, xml);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    return res;
  }

  async getTracking(code) {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
      <soap:Body>
      <GetShipmentHistory xmlns="http://api.ase.com.tr/">
      <AuthorizationCode>${this._encodeXMLParam(this.authorizationCode)}</AuthorizationCode>
      <Password>${this._encodeXMLParam(this.password)}</Password>
      <CWBCode>${this._encodeXMLParam(code)}</CWBCode>
      <Language>En</Language>
      </GetShipmentHistory>
      </soap:Body>
      </soap:Envelope>`;

    const url = 'http://api.ase.com.tr/Connect/Shipping/tracking.asmx';
    let res = await this._makeRequest(url, xml);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    return res;
  }
}

module.exports = AseAPI;