const config = require('../../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

const fetch = require('isomorphic-unfetch');
const convert = require('xml-js');


class MeaSoftAPI {
  constructor(args = {}) {
    const { login = 'test', password = 'testm', extracode = '8' } = args;

    this.login     = login;
    this.password  = password;
    this.extracode = extracode;
  }

  async create(order) {
    const ret = await this.createOrder(order, 'NO');
    //console.log(JSON.stringify(ret));

    if (ret.neworder.createorder._attributes.errormsg.toLowerCase() != 'success') throw Error('CreateOrder: ' + ret.neworder.createorder._attributes.errormsg);

    const id = ret.neworder.createorder._attributes.barcode;

    const waybill = await this.getWaybill(id);
    //console.log(waybill.waybill.content);

    const data = waybill.waybill.content._text;
    
    const ret2 = await this.createOrder(order, 'YES');
    if (ret2.neworder.createorder._attributes.errormsg.toLowerCase() != 'success') throw Error('CreatePickup: ' + ret2.neworder.createorder._attributes.errormsg);

    return {
      id,
      waybill: data,
    };
  }

  async track(id) {
    let orderStatus = null;
    let status = null;

    const ret = await this.getDeliveryStatus(id);
    if (ret.statusreq._attributes.count != 1) throw Error('statusreq count is wrong.');
    //console.log(JSON.stringify(ret.statusreq.order.status));
    //{"_attributes":{"eventstore":"Web-службы","eventtime":"2020-08-28 12:43:19","createtimegmt":"2020-08-28 12:43:19","message":"","title":"Новый"},"_text":"NEW"}

    status = ret.statusreq.order.status._text;

    if (['AWAITING_SYNC', 'NEW'].indexOf(status) > -1) {
      orderStatus = 'confirmed';
    } else if (['COMPLETE'].indexOf(status) > -1) {
      orderStatus = 'delivered';
    } else if (['CANCELED'].indexOf(status) > -1) {
      orderStatus = 'canceled';
    } else if (['COURIERRETURN', 'COURIERCANCELED', 'RETURNING', 'LOST', 'RETURNED'].indexOf(status) > -1) {
      orderStatus = 'attention';
    } else {
      orderStatus = 'in_transit';
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

  async _makeRequest(xml) {
    const res = await fetch('https://home.courierexe.ru/api/', {
      method: 'POST',
      body: xml,
      headers: {
        'Content-Type': 'application/xml',
      },
    });

    const text = await res.text();
    //console.log(text);
    return text;
  }

  async getRequestsLog() {
    return [];
  }

  async createOrder(order, pickup = 'NO') {
    const id = this._encodeXMLParam(order.id) + '-' + (1000 + (Math.floor(Math.random() * 8999)));

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <neworder>
          <auth login="${this._encodeXMLParam(this.login)}" pass="${this._encodeXMLParam(this.password)}" extra="${this._encodeXMLParam(this.extracode)}"/>
          <order ${pickup == 'NO' ? `orderno="${id}"` : `orderno="0"`}>
              <orderno/>
              <sender>
                  ${order.addressDetailsFrom.companyName ? `<company>${this._encodeXMLParam(order.addressDetailsFrom.companyName)}</company>` : '<company>Частное лицо</company>'}
                  <person>${this._encodeXMLParam(order.addressDetailsFrom.firstName)} ${this._encodeXMLParam(order.addressDetailsFrom.lastName)}</person>
                  <phone>${this._encodeXMLParam(order.addressDetailsFrom.phone)}</phone>
                  <zipcode>${this._encodeXMLParam(order.addressDetailsFrom.postCode)}</zipcode>
                  <town>${this._encodeXMLParam(order.addressDetailsFrom.city)}</town>
                  <address>${this._encodeXMLParam(order.addressDetailsFrom.addressLine1 + (order.addressDetailsFrom.addressLine2 ? ` ${order.addressDetailsFrom.addressLine2}`: '') + (order.externalComment ? ` | ${this._encodeXMLParam(order.externalComment)}` : ''))}</address>
                  <date>${moment(order.pickupTime).format('YYYY-MM-DD')}</date>
                  <time_min>10:00</time_min>
                  <time_max>${order.Carrier.RateParams[0].pickupBefore.substring(0, 5)}</time_max>
              </sender>
              <receiver>
                  ${order.addressDetailsTo.companyName ? `<company>${this._encodeXMLParam(order.addressDetailsTo.companyName)}</company>` : '<company>Частное лицо</company>'}
                  <person>${this._encodeXMLParam(order.addressDetailsTo.firstName)} ${this._encodeXMLParam(order.addressDetailsTo.lastName)}</person>
                  <phone>${this._encodeXMLParam(order.addressDetailsTo.phone)}</phone>
                  <zipcode>${this._encodeXMLParam(order.addressDetailsTo.postCode)}</zipcode>
                  <town>${this._encodeXMLParam(order.addressDetailsTo.city)}</town>
                  <address>${this._encodeXMLParam(order.addressDetailsTo.addressLine1 + (order.addressDetailsTo.addressLine2 ? ` ${order.addressDetailsTo.addressLine2}`: ''))}</address>
                  <date>${moment(order.pickupTime).format('YYYY-MM-DD')}</date>
                  <time_min>10:00</time_min>
                  <time_max>17:00</time_max>
              </receiver>
              <paytype>NO</paytype>
              ` + /* <price>${this._encodeXMLParam(order.totalPrice)}</price> */ `
              <deliveryprice>0</deliveryprice>
              <discount>0</discount>
              <inshprice>0</inshprice>
              <enclosure>${this._encodeXMLParam(order.contents)}</enclosure>
              ${order.OrderServices.length == 0 ? '<instruction/>' : ''}
              ${order.OrderServices.length > 0 ? '<instruction>' + order.OrderServices.map((s) => s.name['ru'] + ' x ' + s.quantity).join(', ')  + '</instruction>' : ''}
              <service>${order.RateType.type == 'express' ? 1 : 0}</service>
              <type>${order.PackageType.type == 'documents' ? 1 : 3}</type>
              <return>NO</return>
              <pickup>${pickup}</pickup>
              <weight>${order.Packages.reduce((a, v) => a + v.weight, 0)}</weight>
              <quantity>${order.Packages.reduce((a, v) => a + v.quantity, 0)}</quantity>
          </order>
      </neworder>`;

    let res = await this._makeRequest(xml);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    return res;
  }

  async getWaybill(id) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <waybill>
          <auth login="${this._encodeXMLParam(this.login)}" pass="${this._encodeXMLParam(this.password)}" extra="${this._encodeXMLParam(this.extracode)}"/>
          <orders>
              <order orderno="${this._encodeXMLParam(id)}" />
          </orders>
          <form>1</form>
      </waybill>`;

    let res = await this._makeRequest(xml);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    return res;
  }

  async getDeliveryStatus(id) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <statusreq>
          <auth login="${this._encodeXMLParam(this.login)}" pass="${this._encodeXMLParam(this.password)}" extra="${this._encodeXMLParam(this.extracode)}"/>
          <orderno>${this._encodeXMLParam(id)}</orderno>
      </statusreq>`;

    let res = await this._makeRequest(xml);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    return res;
  }
}

module.exports = MeaSoftAPI;
