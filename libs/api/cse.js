const config = require('../../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

const fetch = require('node-fetch');
const convert = require('xml-js');

const snooze = ms => new Promise(resolve => setTimeout(resolve, ms));
const pauseTime = (config.type == 'bestsender') ? 30000 : 5000;

const AbortController = require('abort-controller');

const cache = require('../cache');
const md5 = require('md5');
const { readdir } = require('fs');


class CseAPI {
  constructor(args = {}) {
    const { login = 'test', password = '2016', test = false } = args;
    this.login     = login;
    this.password  = password;
    this.test      = test;
    this.requestsLog = [];
  }

  async create(order) {
    const ret = await this.createOrder(order);
    //console.log('ret:', JSON.stringify(ret));
    const id = ret.documentNumber;
    const waybill = await this.getWaybill(ret.waybillNumber);
    //console.log('waybill:', JSON.stringify(waybill));
    const data = waybill['soap:Envelope']['soap:Body']['m:GetFormsForDocumentsResponse']['m:return']['m:List']['m:BData']['_text'];
    
    return {
      id,
      waybill: data,
    }
  }

  async track(id) {
    let orderStatus = null;
    let status = null;
    let trackedStatuses;
    let lastStatus;

    const ret = await this.getDeliveryStatus(id);
    let eventsHistory = ret['soap:Envelope']['soap:Body']['m:TrackingResponse']['m:return']['m:List']
    
    let statusIdPattern = /\w{8}-\w{4}-\w{4}-\w{4}-\w{12}/g; 
    let statusCodes = Array.from(JSON.stringify(eventsHistory).matchAll(statusIdPattern), (m) => m[0]);
    let deliveredStatuses = [
      {
        key: '8e5ded66-a8f5-4fa8-b863-03e1e0406df5',
        text: 'Заказ успешно доставлен',
        status: 'delivered'
      },
      {
        key: '0997e505-7ccf-42cd-b5e3-dda20d26da27',
        text: 'Доставка завершена',
        status: 'delivered'
      },
      {
        key: '052bdc4e-02b2-4209-b2ab-1e856d330ef5',
        text: 'Заказ выполнен.',
        status: 'delivered'
      },
    ];
    const delivered = deliveredStatuses.filter(x => statusCodes.includes(x.key));
    
    if (!!delivered.length) {
      console.log(`Seems like order ${id} is delivered =) `)

      return ({
        status: delivered.pop(),
        orderStatus: 'delivered',
      });
    }

    if (Array.isArray(eventsHistory)) {
      trackedStatuses = eventsHistory.find((w) => w['m:Key']['_text'].trim() == order.tracking)['m:List'];
    } else {
      trackedStatuses = eventsHistory['m:List'];
    }
    
    if (Array.isArray(trackedStatuses)) {
      lastStatus = trackedStatuses.pop();
    } else {
      lastStatus = trackedStatuses;
    }

    if (lastStatus) {
      let lastStatusId = lastStatus['m:Properties'].find((n) => n['m:Key']['_text'] == 'GUID')['m:Value']['_text'];

      if (lastStatusId) {
        status = [
          {
            key: '73fb7129-f4f6-11e4-a887-001e67086478',
            text: 'Заказ подтвержден клиентом',
            status: 'confirmed'
          },
          {
            key: '4a39268e-d5a9-44b1-9255-3296d48df57f',
            text: 'Курьер отправлен.',
            status: 'confirmed'
          },
          {
            key: '6f2c0759-4b35-40d2-ae35-7e72cc43f267',
            text: 'Назначен курьер',
            status: 'confirmed'
          },
          {
            key: 'b7a84166-3233-4844-a0af-06761f65ffdd',
            text: 'На основании заказа оформлена накладная.',
            status: 'confirmed'
          },
          {
            key: '0bcffda3-d0ca-4104-bc58-fbd374f325cd',
            text: 'Заказ принят. Идет обработка заказа.',
            status: 'confirmed'
          },
          {
            key: '44133e83-0fb3-4338-9ddd-461e2e565c1a',
            text: 'Заказ утвержден.',
            status: 'confirmed'
          },
          {
            key: 'b7b5f799-94c7-4588-bae4-c14df35c9752',
            text: 'Груз получен на склад КС.',
            status: 'in_transit'
          },
          {
            key: 'b2af9ad9-22bd-4476-9393-7b51ffdab6f7',
            text: 'Заказ передан курьеру на доставку.',
            status: 'in_transit'
          },
          {
            key: '1c3ed878-48d2-4192-bbe6-513727535f21',
            text: 'Заказ поступил в город назначения.',
            status: 'in_transit'
          },
          {
            key: '53e93b3e-81b3-4646-8615-af1c982c9aaa',
            text: 'Отправление выбыло со склада.',
            status: 'in_transit'
          },
          {
            key: '8c9ab389-4ef8-4d6c-99d4-c0bb2c62a623',
            text: 'Груз забран',
            status: 'in_transit'
          },
          {
            key: 'c46daf14-0ae8-4881-a7ad-152a05f59227',
            text: 'Груз получен курьером',
            status: 'in_transit'
          },
          {
           key: 'c67e692c-6d2a-4be4-a15b-6c12fc4307df',
           text: 'Заказ проверяется.',
           status: 'in_transit'
          },
          {
           key: '1a5a1c1e-1d09-11e5-8b42-001e67086478',
           text: 'Оформлена расходная накладная',
           status: 'in_transit'
          },
          {
           key: '562d153e-252f-496a-a630-5f1541903b91',
           text: 'Складская операция выполняется...',
           status: 'in_transit'
          },
          {
           key: 'd06dff35-8262-42f7-995c-ee72d28897e7',
           text: 'Складская операция завершена.',
           status: 'in_transit'
          },
          {
            key: 'd6031139-b443-11e8-80c1-7cd30aec6901',
            text: 'Изменение параметров приёма отправления',
            status: 'attention'
          },
          {
            key: '6d63f79d-28ca-11e5-86ab-001e67086478',
            text: 'На утверждении клиента',
            status: 'attention'
          },
          {
            key: 'fc30378d-a132-11e7-875d-001e67086478',
            text: 'Внимание! Информация по доставке',
            status: 'attention'
          },
          {
            key: '6c7f342b-6949-4cc3-9992-8daf98e2084c',
            text: 'Заказ отменён',
            status: 'canceled'
          },
          {
            key: '41dafeb5-64a7-4b38-8be7-c42fa5963add',
            text: 'Заказ отменён клиентом',
            status: 'canceled'
          },
        ].find((n) => n['key'] == lastStatusId);

        if (status) {
          orderStatus = status['status'];
          console.log('status:', status);
        } else {
          console.warn('undefined status: ',{
            'key':lastStatus['m:Properties'][0]['m:Value']['_text'],
            'text': lastStatus['m:Properties'][1]['m:Value']['_text']
          });
        }
      }
    }

    // console.log('*****************************************');
    // if  (status == null) console.warn('Status is null! Events history: ', JSON.stringify(eventsHistory) )
    // console.log('*****************************************');

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

  async _makeRequest(xml, needs_caching = false, cacheTime = (3600000 * 24 * 30)) {
    //if (!this.test) throw Error('TEST ONLY so far!'); // TODO: remove later
    let res = null;
    // console.log('use cache? ',  !needs_caching);

    const url = this.test ? 'http://lk-test.cse.ru/1c/ws/web1c.1cws' : 'http://web.cse.ru/1c/ws/Web1C.1cws';

    let cache_key;
    if (needs_caching) {
      cache_key = 'api_cse_' + md5(url + this.login + '-' + '-' + xml);

      const cache_res = await cache.get(cache_key, cacheTime);
      if (cache_res !== false) {

        res = cache_res;

        this.requestsLog.push({
          date: new Date(),
          req: {
            xml,
          },
          res: {
            xml: res,
          },
          from_cache: true,
        });
        // console.warn(' cache_key => ',  cache_key);
        // console.warn('Cached Responce: ' + cache_res);

        return res;
      } else {
        // console.warn('Cached Responce Not Found :(');
      }
    }

    await snooze(pauseTime);

    console.log('Making request to URL: ' + url);

    const controller = new AbortController();
    const timeout = setTimeout(() => {
      controller.abort();
    }, 30000);



    try {
      res = await fetch(url, {
        method: 'POST',
        body: xml,
        headers: {
          'Content-Type': 'application/xml',
        },
        signal: controller.signal,
      });

      res = await res.text();
    } catch (error) {
  		if (error.name === 'AbortError') {
        //console.log('Request to URL=' + url + ' was aborted: ' + xml);
  		}
      throw error;
  	} finally {
  		clearTimeout(timeout);
  	}

    this.requestsLog.push({
      date: new Date(),
      req: {
        xml,
      },
      res: {
        xml: res,
      },
      from_cache: false,
    });

    //console.log('Responce: ' + res);

    if (needs_caching) {
      await cache.set(cache_key, res);
      //console.log('Responce cached with key: ' + cache_key);
    }

    return res;
  }

  async getRequestsLog() {
    return this.requestsLog;
  }

  async createOrder(order) {
    const inCityDelivery = order.addressDetailsFrom.city == order.addressDetailsTo.city;

    const senderGeographyId = await this._returnGUID(order.addressDetailsFrom);
    const recipientGeographyId = await this._returnGUID(order.addressDetailsTo);

    const urgencyId = await this._returnUrgencyId(order.RateType.type, order.Carrier.api, inCityDelivery);
    const typeOfCargoId = await this._returnTypeOfCargoId(order.PackageType.type, order.Carrier.api);
    console.log('rateType: ', order.RateType.type, 'instance: ', order.Carrier.api, 'inCityDelivery: ', inCityDelivery, ' -> ', urgencyId)
    
    const resShippingMethods = await this.getShippingMethods();
    const resShippingMethod = resShippingMethods.find((u) => {
      const a = u['m:Value']['_text'];
      if (a == 'курьерская') return true;

      return false;
    });
    const shippingMethodId = resShippingMethod['m:Key']['_text'];
    const currencyCode = config.type == 'bestsender' ? 'KZT' : 'RUB';

    const resCurrencies = await this.getCurrencies();
    const resCurrency = resCurrencies.find((u) => {
      const a = u['m:Value']['_text'];
      if (a == currencyCode) return true;

      return false;
    });

    if (!resCurrency)   console.warn('Curency code is unknown!!!');

    const currencyId = resCurrency['m:Key']['_text'];

    let serviceInsurance = false;
    if (order.OrderServices.findIndex((s) => s.action == 'insurance') > -1) {
      // serviceInsurance = true;
      console.log('Order with insurance')
    }

    let serviceCashAssigment = false;
    if (order.OrderServices.findIndex((s) => s.action == 'cash_assigment') > -1) {
      serviceCashAssigment = true;
    }

    let serviceNotification = false;
    if (order.OrderServices.findIndex((s) => s.action == 'notification') > -1) {
      serviceNotification = true;
    }

    //serviceInsurance = true;
    //serviceCashAssigment = true;
    //serviceSendSMS = true;

    const resDocuments = await this.saveDocuments({
      order,
      senderGeographyId,
      recipientGeographyId,
      urgencyId,
      shippingMethodId,
      typeOfCargoId,
      currencyId,
      serviceInsurance,
      serviceCashAssigment,
      serviceNotification,
    });

    if (
      !Array.isArray(resDocuments['soap:Envelope']['soap:Body']['m:SaveDocumentsResponse']['m:return']['m:List']['m:Properties']) &&
      resDocuments['soap:Envelope']['soap:Body']['m:SaveDocumentsResponse']['m:return']['m:List']['m:Properties']['m:Key']['_text'] == 'Error' &&
      resDocuments['soap:Envelope']['soap:Body']['m:SaveDocumentsResponse']['m:return']['m:List']['m:Properties']['m:Value']['_text'] == 'true'
    ) {
      throw Error('Create Order Error: ' + resDocuments['soap:Envelope']['soap:Body']['m:SaveDocumentsResponse']['m:return']['m:List']['m:Properties']['m:List']['m:Value']['_text']);
    }

    const documentNumber = resDocuments['soap:Envelope']['soap:Body']['m:SaveDocumentsResponse']['m:return']['m:List']['m:Properties'].find((n) => n['m:Key']['_text'] == 'Number')['m:Value']['_text'];
    //console.log('documentNumber:', documentNumber);

    const resWaybill = await this.saveWaybill({
      order,
      senderGeographyId,
      recipientGeographyId,
      urgencyId,
      shippingMethodId,
      typeOfCargoId,
      currencyId,
      serviceInsurance,
      serviceCashAssigment,
      serviceNotification,
      documentNumber,
    });
    //console.log('resWaybill:', JSON.stringify(resWaybill));
    if (
      resWaybill['soap:Envelope']['soap:Body']['m:SaveWaybillOfficeResponse']['m:return']['m:Error']['_text'] == 'true'
    ) {
      throw Error('Create Waybill Error: ' + resWaybill['soap:Envelope']['soap:Body']['m:SaveWaybillOfficeResponse']['m:return']['m:ErrorInfo']['_text']);
    }
    const waybillNumber = resWaybill['soap:Envelope']['soap:Body']['m:SaveWaybillOfficeResponse']['m:return']['m:Items']['m:Value']['_text'];
    //console.log('waybillNumber:', waybillNumber);

    return {
      order: resDocuments,
      waybill: resWaybill,
      documentNumber,
      waybillNumber,
    };
  }

  async saveDocuments(params) {
    const {
      order,
      senderGeographyId,
      recipientGeographyId,
      urgencyId,
      shippingMethodId,
      typeOfCargoId,
      currencyId,
      serviceInsurance,
      serviceCashAssigment,
      serviceNotification,
    } = params;

    const xml = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:m="http://www.cargo3.ru">
      <soap:Header/>
      <soap:Body>
      <m:SaveDocuments>
      <m:login>${this._encodeXMLParam(this.login)}</m:login>
      <m:password>${this._encodeXMLParam(this.password)}</m:password>
      <m:data>
      <m:Key>Orders</m:Key>
      <m:List>
      <m:Key>Order</m:Key>
      <m:Fields>
      <m:Key>TakeDate</m:Key>
      <m:Value>${moment(order.pickupTime).format('YYYY-MM-DD') + 'T00:00:00'}</m:Value>
      <m:ValueType>dateTime</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>TakeDateOf</m:Key>
      <m:Value>${moment(order.pickupTime).format('YYYY-MM-DD') + 'T' + order.Carrier.RateParams[0].pickupBefore}</m:Value>
      <m:ValueType>dateTime</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>Comment</m:Key>
      <m:Value>${this._encodeXMLParam(order.externalComment)}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>Sender</m:Key>
      <m:Value>${this._encodeXMLParam(order.addressDetailsFrom.companyName ? order.addressDetailsFrom.companyName : order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName)}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>SenderOfficial</m:Key>
      <m:Value>${this._encodeXMLParam(order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName)}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>SenderGeography</m:Key>
      <m:Value>${senderGeographyId}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>SenderAddress</m:Key>
      <m:Value>${this._encodeXMLParam(order.addressDetailsFrom.addressLine1 + (order.addressDetailsFrom.addressLine2 ? ` ${order.addressDetailsFrom.addressLine2}`: ''))}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>SenderPhone</m:Key>
      <m:Value>${this._encodeXMLParam(order.addressDetailsFrom.phone)}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>SenderEMail</m:Key>
      <m:Value>${this._encodeXMLParam(order.addressDetailsFrom.email)}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>SenderInfo</m:Key>
      <m:Value>${this._encodeXMLParam(order.externalComment)}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>Recipient</m:Key>
      <m:Value>${this._encodeXMLParam(order.addressDetailsTo.companyName ? order.addressDetailsTo.companyName : order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName)}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>RecipientOfficial</m:Key>
      <m:Value>${this._encodeXMLParam(order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName)}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>RecipientGeography</m:Key>
      <m:Value>${recipientGeographyId}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>RecipientAddress</m:Key>
      <m:Value>${this._encodeXMLParam(order.addressDetailsTo.addressLine1 + (order.addressDetailsTo.addressLine2 ? ` ${order.addressDetailsTo.addressLine2}`: ''))}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>RecipientPhone</m:Key>
      <m:Value>${this._encodeXMLParam(order.addressDetailsTo.phone)}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>RecipientEMail</m:Key>
      <m:Value>${this._encodeXMLParam(order.addressDetailsTo.email)}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>RecipientInfo</m:Key>
      <m:Value></m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>Urgency</m:Key>
      <m:Value>${urgencyId}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>Payer</m:Key>
      <m:Value>0</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>PaymentMethod</m:Key>
      <m:Value>1</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>ShippingMethod</m:Key>
      <m:Value>${shippingMethodId}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>TypeOfCargo</m:Key>
      <m:Value>${typeOfCargoId}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>WithReturn</m:Key>
      <m:Value>false</m:Value>
      <m:ValueType>boolean</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>Weight</m:Key>
      <m:Value>${order.Packages.reduce((a, v) => a + v.weight, 0)}</m:Value>
      <m:ValueType>float</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>CargoDescription</m:Key>
      <m:Value>${this._encodeXMLParam(order.contents)}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>CargoPackageQty</m:Key>
      <m:Value>${order.Packages.reduce((a, v) => a + v.quantity, 0)}</m:Value>
      <m:ValueType>int</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>ItemsProcessingAction</m:Key>
      <m:Value>incoming</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>ReplyEMail</m:Key>
      <m:Value>${this._encodeXMLParam(order.addressDetailsFrom.email)}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>ReplySMSPhone</m:Key>
      <m:Value>${this._encodeXMLParam(order.addressDetailsTo.phone)}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>

      ` + (serviceInsurance ? `
      <m:Fields>
      <m:Key>InsuranceRate</m:Key>
      <m:Value>${order.declaredValue}</m:Value>
      <m:ValueType>float</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>InsuranceRateCurrency</m:Key>
      <m:Value>${currencyId}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>` : '') + `

      ` + (serviceInsurance || serviceCashAssigment ? `
      <m:Fields>
      <m:Key>DeclaredValueRate</m:Key>
      <m:Value>${order.declaredValue}</m:Value>
      <m:ValueType>float</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>DeclaredValueRateCurrency</m:Key>
      <m:Value>${currencyId}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>` : '') + `

      </m:List>
      </m:data>
      <m:parameters>
      <m:Key>Parameters</m:Key>
      <m:List>
      <m:Key>DocumentType</m:Key>
      <m:Value>order</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:List>
      </m:parameters>
      </m:SaveDocuments></soap:Body>
      </soap:Envelope>
      `;
    /*
    <m:Fields>
    <m:Key>Height</m:Key>
    <m:Value>10</m:Value>
    <m:ValueType>float</m:ValueType>
    </m:Fields>
    <m:Fields>
    <m:Key>Length</m:Key>
    <m:Value>10</m:Value>
    <m:ValueType>float</m:ValueType>
    </m:Fields>
    <m:Fields>
    <m:Key>Width</m:Key>
    <m:Value>10</m:Value>
    <m:ValueType>float</m:ValueType>
    </m:Fields>
    */

    let res = await this._makeRequest(xml);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    return res;
  }

  async saveWaybill(params) {
    const {
      order,
      senderGeographyId,
      recipientGeographyId,
      urgencyId,
      shippingMethodId,
      typeOfCargoId,
      currencyId,
      serviceInsurance,
      serviceCashAssigment,
      serviceNotification,
      documentNumber,
    } = params;

    let xml = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope" xmlns:car="http://www.cargo3.ru"
            xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xs="http://www.w3.org/2001/XMLSchema">
         <soap:Header/>
         <soap:Body>
             <car:SaveWaybillOffice>
                 <car:Language/>
                 <car:Login>${this._encodeXMLParam(this.login)}</car:Login>
                 <car:Password>${this._encodeXMLParam(this.password)}</car:Password>
                 <car:Company/>
                 <car:Number/>
                 <car:ClientNumber>${documentNumber}</car:ClientNumber>
                 <car:OrderData>
                     <car:ClientContact/>
                     <car:Recipient>
                         <car:Client>${this._encodeXMLParam(order.addressDetailsTo.companyName ? order.addressDetailsTo.companyName : order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName)}</car:Client>
                         <car:Official>${this._encodeXMLParam(order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName)}</car:Official>
                         <car:Address>
                             <car:Geography>${recipientGeographyId}</car:Geography>
                             <car:Info>${order.addressDetailsTo.addressLine1 + (order.addressDetailsTo.addressLine2 ? ` ${order.addressDetailsTo.addressLine2}`: '')}</car:Info>
                             <car:FreeForm>true</car:FreeForm>
                         </car:Address>
        				 <car:Phone>${this._encodeXMLParam(order.addressDetailsTo.phone)}</car:Phone>
        				 <car:EMail>${this._encodeXMLParam(order.addressDetailsTo.email)}</car:EMail>
        				 <car:Urgency>${urgencyId}</car:Urgency>
                 <car:Cargo>
                     <car:CargoDescription>${this._encodeXMLParam(order.contents)}</car:CargoDescription>
                     <car:CargoPackageQty>${order.Packages.reduce((a, v) => a + v.quantity, 0)}</car:CargoPackageQty>
                     <car:Weight>${order.Packages.reduce((a, v) => a + v.weight, 0)}</car:Weight>
                     ` + (serviceInsurance ? `
                     <car:InsuranceRate>${order.declaredValue}</car:InsuranceRate>
                     <car:InsuranceRateCurrency>${currencyId}</car:InsuranceRateCurrency>
                     ` : '' ) + `
                     ` + (serviceInsurance || serviceCashAssigment ? `
                     <car:DeclaredValueRate>${order.declaredValue}</car:DeclaredValueRate>
                     <car:DeclaredValueRateCurrency>${currencyId}</car:DeclaredValueRateCurrency>
                     ` : '' ) +
                 `</car:Cargo>
                 <car:DeliveryOptions>
                   <car:CashOnDelivery>${ serviceCashAssigment ? 'true' : 'false' }</car:CashOnDelivery>
                 </car:DeliveryOptions>`;
		xml += `</car:Recipient>
					 <car:ReplyEMail>${this._encodeXMLParam(order.addressDetailsTo.email)}</car:ReplyEMail>
                     <car:Sender>
                         <car:Client>${this._encodeXMLParam(order.addressDetailsFrom.companyName ? order.addressDetailsFrom.companyName : order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName)}</car:Client>
                         <car:Official>${this._encodeXMLParam(order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName)}</car:Official>
                         <car:Address>
                             <car:Geography>${senderGeographyId}</car:Geography>
                             <car:Info>${order.addressDetailsFrom.addressLine1 + (order.addressDetailsFrom.addressLine2 ? ` ${order.addressDetailsFrom.addressLine2}`: '')}</car:Info>
                             <car:FreeForm>false</car:FreeForm>
                         </car:Address>
                         <car:Phone>${this._encodeXMLParam(order.addressDetailsFrom.phone)}</car:Phone>
                         <car:EMail>${this._encodeXMLParam(order.addressDetailsFrom.email)}</car:EMail>`;
		xml += `</car:Sender>
              <car:TakeDate>${moment(order.pickupTime).format('YYYY-MM-DD') + 'T00:00:00'}</car:TakeDate>
              <car:TypeOfCargo>${typeOfCargoId}</car:TypeOfCargo>
              <car:TypeOfPayer>0</car:TypeOfPayer>
              <car:WayOfPayment>1</car:WayOfPayment>
              <car:Comment>${this._encodeXMLParam(order.externalComment)}</car:Comment>
              <car:DeliveryOfCargo>${serviceCashAssigment ? 0 : serviceNotification ? 3 : 1}</car:DeliveryOfCargo>
              <car:TypeOfParentForWaybill>order</car:TypeOfParentForWaybill>
              <car:ParentOrderForWaybill>${this._encodeXMLParam(documentNumber)}</car:ParentOrderForWaybill>
                 </car:OrderData>
                 <car:Office/>
             </car:SaveWaybillOffice>
         </soap:Body>
        </soap:Envelope>`;

        console.log('xml:', xml);

        let res = await this._makeRequest(xml);
        res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
        return res;
  }

  async getErrorCode() {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.cargo3.ru">
      <soap:Header/>
      <soap:Body>
      <ns1:GetReferenceData>
      <ns1:login>${this._encodeXMLParam(this.login)}</ns1:login>
      <ns1:password>${this._encodeXMLParam(this.password)}</ns1:password>
      <ns1:parameters>
      <ns1:Key>parameters</ns1:Key>
      <ns1:List>
      <ns1:Key>Reference</ns1:Key>
      <ns1:Value>ErrorCodes</ns1:Value>
      <ns1:ValueType>string</ns1:ValueType>
      </ns1:List>
      </ns1:parameters>
      </ns1:GetReferenceData>
      </soap:Body>
      </soap:Envelope>`;

    let res = await this._makeRequest(xml, true);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    return res;
  }

  async _getGeography(search) {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.cargo3.ru">
      <soap:Header/>
      <soap:Body>
      <ns1:GetReferenceData>
      <ns1:login>${this._encodeXMLParam(this.login)}</ns1:login>
      <ns1:password>${this._encodeXMLParam(this.password)}</ns1:password>
      <ns1:parameters>
      <ns1:Key>parameters</ns1:Key>
      <ns1:List>
      <ns1:Key>Reference</ns1:Key>
      <ns1:Value>Geography</ns1:Value>
      <ns1:ValueType>string</ns1:ValueType>
      </ns1:List>
      <ns1:List>
      <ns1:Key>Search</ns1:Key>
      <ns1:Value>${this._encodeXMLParam(search)}</ns1:Value>
      <ns1:ValueType>string</ns1:ValueType>
      </ns1:List>
      </ns1:parameters>
      </ns1:GetReferenceData>
      </soap:Body>
      </soap:Envelope>`;

    let res = await this._makeRequest(xml, true);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });

    return res;
  }

  async _returnGUID(address) {
    let res = null;

    if (!!address.fiasGUID && address.countryCode == 'RU') {
      res = 'fias-' + address.fiasGUID;
    } else {
      const resGeography = await this.getGeography(address.city.trim());
      if (!resGeography) throw Error(`CSE: Geography "${address.city.trim()}" not found`);
        res = resGeography['m:Key']['_text'];
    }

    return res;
  }

  async _returnUrgencyId(rateType, instance='cse', inCityDelivery=false) {
    let res = null;

    const resUrgencies = await this.getUrgencies();

    const resUrgency = resUrgencies.find((u) => {
      const a = u['m:Value']['_text'];

      switch (instance) {
        case 'cse_msk_mo':
          if (a == 'Эконом доставка' && rateType == 'economy') return true;
          if (a == 'Срочная' && rateType == 'express') return true;
          if (a == 'Сверхсрочная' && rateType == 'super_express') return true;
          if (a == 'Суточная' && rateType == 'daily') return true;
          break;
        case 'cse_im':
          if (a == 'Срочная' && rateType == 'standard') return true;
          break;
        case 'cse_cargo':
          if (a == 'Сборный груз' && rateType == 'standard') return true;
          break;
        case 'cse_business':
          if (inCityDelivery && rateType == 'express') {
            if (a == 'Суточная') return true;
          } else {
            if (a == 'Эконом доставка' && rateType == 'economy') return true;
            if (a == 'Срочная' && rateType == 'express') return true;
            if (a == 'Сверхсрочная' && rateType == 'super_express') return true;
            if (a == 'Суточная' && rateType == 'daily') return true;
            if (a == 'Стандартная' && rateType == 'standard') return true;
          }
          break;
        default:
          if (inCityDelivery && rateType == 'express') {
            if (a == 'Суточная') return true;
          } else {
            if (a == 'Эконом доставка' && rateType == 'economy') return true;
            if (a == 'Стандартная' && rateType == 'standard') return true;
            if (a == 'Срочная' && rateType == 'express') return true;
            if (a == 'Сверхсрочная' && rateType == 'super_express') return true;
          }
      }
      
      return false;
    });

    if (resUrgency)
      res = resUrgency['m:Key']['_text'];

    return res;
  }

  async _returnTypeOfCargoId(packageType, instance='cse') {
    let res = null;

    const resTypesOfCargo = await this.getTypesOfCargo();
    const resTypeOfCargo = resTypesOfCargo.find((u) => {
      const a = u['m:Value']['_text'];
      switch (instance) {
        case 'cse_cargo': 
          if (a == 'Сборный груз' && packageType == 'box') return true;
          break;
        default:
          if (a == 'Документы' && packageType == 'documents') return true;
          if (a == 'Груз' && packageType == 'box') return true;
          if (a == 'Негабаритный груз' && packageType == 'custom') return true;
      }

      return false;
    });

    if (resTypeOfCargo)
      res = resTypeOfCargo['m:Key']['_text'];

    return res;
  }

  _formatRate(rate) {
    let res = null;
    if (typeof(rate) != 'undefined')
      res =  {
        'price': rate['m:Fields'][0]['m:Value']['_text'],
        'extra': {
          'deliveryTime': {
            'from': rate['m:Fields'][7]['m:Value']['_text'],
            'to': rate['m:Fields'][8]['m:Value']['_text']
          },
          'code': rate['m:Fields'][6]['m:Value']['_text'],
          'name': rate['m:Fields'][3]['m:Value']['_text'],
        },
      };

    return(res);
  }

  async getGeography(city) {
    city = city.trim()
    if (city.toUpperCase() == 'АКСАЙ') city = 'Аксай г';
    if (city.toUpperCase() == 'АКСУ') city = 'Аксу г';
    if (city.toUpperCase() == 'АЛМАТА') city = 'Алматы г';
    if (city.toUpperCase() == 'АЛМАТЫ') city = 'Алматы г';
    if (city.toUpperCase() == 'АЛМА-АТА') city = 'Алматы г';
    if (city.toUpperCase() == 'ALMATA') city = 'Алматы г';
    if (city.toUpperCase() == 'ALMATY') city = 'Алматы г';
    if (city.toUpperCase() == 'ALMA-ATA') city = 'Алматы г';
    if (city.toUpperCase() == 'АСТАНА') city = 'Астана г';
    if (city.toUpperCase() == 'ASTANA') city = 'Астана г';
    if (city.toUpperCase() == 'БАЙКОНУР') city = 'Байконур г';
    if (city.toUpperCase() == 'БИШКЕК') city = 'Бишкек г';
    if (city.toUpperCase() == 'БОРАЛДАЙ') city = 'Боралдай п';
    if (city.toUpperCase() == 'БУРАБАЙ') city = 'Бурабай п';
    if (city.toUpperCase() == 'ДУШАНБЕ') city = 'Dushanbe';
    if (city.toUpperCase() == 'КАРАГАНДЫ') city = 'Караганда';
    if (city.toUpperCase() == 'КАПШАГАЙ') city = 'Конаев г';
    if (city.toUpperCase() == 'КОНАЕВ') city = 'Конаев г';
    if (city.toUpperCase() == 'КУРЧАТОВ') city = 'Курчатов г';
    if (city.toUpperCase() == 'КУЛЬСАРЫ') city = 'Кульсары г';
    if (city.toUpperCase() == 'САНКТ-ПЕТЕРБУРГ') city = 'Санкт-Петербург г';
    if (city.toUpperCase() == 'ТАШКЕНТ') city = 'Tashkent';
    if (city.toUpperCase() == 'ШЫМКЕНТ') city = 'Шымкент г';

    const resCity = await this._getGeography(city);
    const listCity = resCity['soap:Envelope']['soap:Body']['m:GetReferenceDataResponse']['m:return']['m:List'];

    city == 'Байконур' ?
    console.warn('listCity', JSON.stringify(listCity)) : '';
	  console.warn(city);

    if (listCity) {
      if (!Array.isArray(listCity)) {
        return listCity;
      } else {
		console.warn('More than one result gotten!')
	  }
    } else {
      city = city + ' г';
      const resCity2 = await this._getGeography(city);
      const listCity2 = resCity2['soap:Envelope']['soap:Body']['m:GetReferenceDataResponse']['m:return']['m:List'];
      if (listCity2 && !Array.isArray(listCity2)) {
        return listCity2;
      }
    }
    return null;
  }

  async getUrgencies() {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.cargo3.ru">
      <soap:Header/>
      <soap:Body>
      <ns1:GetReferenceData>
      <ns1:login>${this._encodeXMLParam(this.login)}</ns1:login>
      <ns1:password>${this._encodeXMLParam(this.password)}</ns1:password>
      <ns1:parameters>
      <ns1:Key>parameters</ns1:Key>
      <ns1:List>
      <ns1:Key>Reference</ns1:Key>
      <ns1:Value>Urgencies</ns1:Value>
      <ns1:ValueType>string</ns1:ValueType>
      </ns1:List>
      </ns1:parameters>
      </ns1:GetReferenceData>
      </soap:Body>
      </soap:Envelope>`;

    let res = await this._makeRequest(xml, true);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });

    const list = res['soap:Envelope']['soap:Body']['m:GetReferenceDataResponse']['m:return']['m:List'];
    if (!Array.isArray(list)) {
      return [list];
    } else {
      return list;
    }
  }

  async getDeliveryTypes() {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.cargo3.ru">
      <soap:Header/>
      <soap:Body>
      <ns1:GetReferenceData>
      <ns1:login>${this._encodeXMLParam(this.login)}</ns1:login>
      <ns1:password>${this._encodeXMLParam(this.password)}</ns1:password>
      <ns1:parameters>
      <ns1:Key>parameters</ns1:Key>
      <ns1:List>
      <ns1:Key>Reference</ns1:Key>
      <ns1:Value>DeliveryType</ns1:Value>
      <ns1:ValueType>string</ns1:ValueType>
      </ns1:List>
      </ns1:parameters>
      </ns1:GetReferenceData>
      </soap:Body>
      </soap:Envelope>`;

    let res = await this._makeRequest(xml, true);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    return res;
  }

  async getPayers() {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.cargo3.ru">
      <soap:Header/>
      <soap:Body>
      <ns1:GetReferenceData>
      <ns1:login>${this._encodeXMLParam(this.login)}</ns1:login>
      <ns1:password>${this._encodeXMLParam(this.password)}</ns1:password>
      <ns1:parameters>
      <ns1:Key>parameters</ns1:Key>
      <ns1:List>
      <ns1:Key>Reference</ns1:Key>
      <ns1:Value>Payers</ns1:Value>
      <ns1:ValueType>string</ns1:ValueType>
      </ns1:List>
      </ns1:parameters>
      </ns1:GetReferenceData>
      </soap:Body>
      </soap:Envelope>`;

    let res = await this._makeRequest(xml, true);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });

    const list = res['soap:Envelope']['soap:Body']['m:GetReferenceDataResponse']['m:return']['m:List'];
    if (!Array.isArray(list)) {
      return [list];
    } else {
      return list;
    }
  }

  async getPaymentMethods() {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.cargo3.ru">
      <soap:Header/>
      <soap:Body>
      <ns1:GetReferenceData>
      <ns1:login>${this._encodeXMLParam(this.login)}</ns1:login>
      <ns1:password>${this._encodeXMLParam(this.password)}</ns1:password>
      <ns1:parameters>
      <ns1:Key>parameters</ns1:Key>
      <ns1:List>
      <ns1:Key>Reference</ns1:Key>
      <ns1:Value>PaymentMethods</ns1:Value>
      <ns1:ValueType>string</ns1:ValueType>
      </ns1:List>
      </ns1:parameters>
      </ns1:GetReferenceData>
      </soap:Body>
      </soap:Envelope>`;

    let res = await this._makeRequest(xml, true);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });

    const list = res['soap:Envelope']['soap:Body']['m:GetReferenceDataResponse']['m:return']['m:List'];
    if (!Array.isArray(list)) {
      return [list];
    } else {
      return list;
    }
  }

  async getShippingMethods() {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.cargo3.ru">
      <soap:Header/>
      <soap:Body>
      <ns1:GetReferenceData>
      <ns1:login>${this._encodeXMLParam(this.login)}</ns1:login>
      <ns1:password>${this._encodeXMLParam(this.password)}</ns1:password>
      <ns1:parameters>
      <ns1:Key>parameters</ns1:Key>
      <ns1:List>
      <ns1:Key>Reference</ns1:Key>
      <ns1:Value>ShippingMethods</ns1:Value>
      <ns1:ValueType>string</ns1:ValueType>
      </ns1:List>
      </ns1:parameters>
      </ns1:GetReferenceData>
      </soap:Body>
      </soap:Envelope>`;

    let res = await this._makeRequest(xml, true);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });

    const list = res['soap:Envelope']['soap:Body']['m:GetReferenceDataResponse']['m:return']['m:List'];
    if (!Array.isArray(list)) {
      return [list];
    } else {
      return list;
    }
  }

  async getTypesOfCargo() {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.cargo3.ru">
      <soap:Header/>
      <soap:Body>
      <ns1:GetReferenceData>
      <ns1:login>${this._encodeXMLParam(this.login)}</ns1:login>
      <ns1:password>${this._encodeXMLParam(this.password)}</ns1:password>
      <ns1:parameters>
      <ns1:Key>parameters</ns1:Key>
      <ns1:List>
      <ns1:Key>Reference</ns1:Key>
      <ns1:Value>TypesOfCargo</ns1:Value>
      <ns1:ValueType>string</ns1:ValueType>
      </ns1:List>
      </ns1:parameters>
      </ns1:GetReferenceData>
      </soap:Body>
      </soap:Envelope>`;

    let res = await this._makeRequest(xml, true, (36000*24*30));
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });

    const list = res['soap:Envelope']['soap:Body']['m:GetReferenceDataResponse']['m:return']['m:List'];
    if (!Array.isArray(list)) {
      return [list];
    } else {
      return list;
    }
  }

  async getCurrencies() {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.cargo3.ru">
      <soap:Header/>
      <soap:Body>
      <ns1:GetReferenceData>
      <ns1:login>${this._encodeXMLParam(this.login)}</ns1:login>
      <ns1:password>${this._encodeXMLParam(this.password)}</ns1:password>
      <ns1:parameters>
      <ns1:Key>parameters</ns1:Key>
      <ns1:List>
      <ns1:Key>Reference</ns1:Key>
      <ns1:Value>Currencies</ns1:Value>
      <ns1:ValueType>string</ns1:ValueType>
      </ns1:List>
      </ns1:parameters>
      </ns1:GetReferenceData>
      </soap:Body>
      </soap:Envelope>`;

    let res = await this._makeRequest(xml, true);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });

    const list = res['soap:Envelope']['soap:Body']['m:GetReferenceDataResponse']['m:return']['m:List'];
    if (!Array.isArray(list)) {
      return [list];
    } else {
      return list;
    }
  }

  async getServices() {
    const xml = `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.cargo3.ru">
      <soap:Header/>
      <soap:Body>
      <ns1:GetReferenceData>
      <ns1:login>${this._encodeXMLParam(this.login)}</ns1:login>
      <ns1:password>${this._encodeXMLParam(this.password)}</ns1:password>
      <ns1:parameters>
      <ns1:Key>parameters</ns1:Key>
      <ns1:List>
      <ns1:Key>Reference</ns1:Key>
      <ns1:Value>Services</ns1:Value>
      <ns1:ValueType>string</ns1:ValueType>
      </ns1:List>
      </ns1:parameters>
      </ns1:GetReferenceData>
      </soap:Body>
      </soap:Envelope>`;

    let res = await this._makeRequest(xml, true);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });

    const list = res['soap:Envelope']['soap:Body']['m:GetReferenceDataResponse']['m:return']['m:List'];
    if (!Array.isArray(list)) {
      return [list];
    } else {
      return list;
    }
  }

  async getFormsForDocuments(docNo) {
    const xml = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
      <soap:Header/>
      <soap:Body>
      <m:GetFormsForDocuments xmlns:m="http://www.cargo3.ru">
      <m:login>${this._encodeXMLParam(this.login)}</m:login>
      <m:password>${this._encodeXMLParam(this.password)}</m:password>
      <m:documents>
      <m:Key>Documents</m:Key>
      <m:List>
      <m:Key>${this._encodeXMLParam(docNo)}</m:Key>
      </m:List>
      </m:documents>
      <m:parameters>
      <m:Key>Parameters</m:Key>
      <m:List>
      <m:Key>DocumentType</m:Key>
      <m:Value>waybill</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:List>
      <m:List>
      <m:Key>Type</m:Key>
      <m:Value>print</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:List>
      <m:List>
      <m:Key>OnlyPath</m:Key>
      <m:Value>false</m:Value>
      <m:ValueType>boolean</m:ValueType>
      </m:List>
      <m:List>
      <m:Key>Format</m:Key>
      <m:Value>PDF</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:List>
      <m:List>
      <m:Key>Name</m:Key>
      <m:Value>Заказ для уведомлений</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:List>
      </m:parameters>
      </m:GetFormsForDocuments>
      </soap:Body>
      </soap:Envelope>`;

    let res = await this._makeRequest(xml);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    return res;
  }

  async getWaybill(docNo) {
    return await this.getFormsForDocuments(docNo);
  }

  async getTracking(docNo) {
    const xml = `<SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ns1="http://www.cargo3.ru">
      <SOAP-ENV:Body>
      <ns1:Tracking>
      <ns1:login>${this._encodeXMLParam(this.login)}</ns1:login>
      <ns1:password>${this._encodeXMLParam(this.password)}</ns1:password>
      <ns1:documents>
      <ns1:Key>Documents</ns1:Key>
      <ns1:Properties>
       <ns1:Key>DocumentType</ns1:Key>
       <ns1:Value>Order</ns1:Value>
       <ns1:ValueType>string</ns1:ValueType>
      </ns1:Properties>
      <ns1:Properties>
       <ns1:Key>OnlySelectedType</ns1:Key>
       <ns1:Value>true</ns1:Value>
       <ns1:ValueType>boolean</ns1:ValueType>
      </ns1:Properties>
      <ns1:List>
       <ns1:Key>${this._encodeXMLParam(docNo)}</ns1:Key>
      </ns1:List>
      </ns1:documents>
      <ns1:parameters>
       <ns1:Key>Parameters</ns1:Key>
      </ns1:parameters>
      </ns1:Tracking>
      </SOAP-ENV:Body>
      </SOAP-ENV:Envelope>`;

      let res = await this._makeRequest(xml);
      res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });

      return res;
  }

  async getCargoStates(type = 'order') {
    const xml = `<SOAP-ENV:Envelope
          xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
          xmlns:ns1="http://www.cargo3.ru">
          <SOAP-ENV:Body>
            <ns1:GetReferenceData>
              <ns1:login>${this._encodeXMLParam(this.login)}</ns1:login>
              <ns1:password>${this._encodeXMLParam(this.password)}</ns1:password>
              <ns1:parameters>
                <ns1:Key>parameters</ns1:Key>
                <ns1:List>
                  <ns1:Key>Reference</ns1:Key>
                  <ns1:Value>CargoStates</ns1:Value>
                  <ns1:ValueType>string</ns1:ValueType>
                </ns1:List>
                <ns1:List>
                  <ns1:Key>DocumentType</ns1:Key>
                  <ns1:Value>${type}</ns1:Value>
                  <ns1:ValueType>string</ns1:ValueType>
                </ns1:List>
              </ns1:parameters>
            </ns1:GetReferenceData>
          </SOAP-ENV:Body>
      </SOAP-ENV:Envelope>`;

    let res = await this._makeRequest(xml, true);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    return res;
  }

  async getDeliveryStatus(docNo) {
    return await this.getTracking(docNo);
  }

  async getRate(order){
    console.log('getRate running...');
    const inCityDelivery = order.addressDetailsFrom.city == order.addressDetailsTo.city;

    const instance = order.hasOwnProperty('Carrier') && order.Carrier.api != undefined ? 
      order.Carrier.api:
      order.rate.Zone.Carrier.api;

    let rates = null;

    let start = new Date();
    let packages = ((order.Packages) ? order.Packages : order.packages);
    let packageType = ((order.hasOwnProperty('PackageType') && readdir.PackageType.type != undefined) ?
      order.PackageType.type  : order.packageType);
    let rateType = ((order.hasOwnProperty('RateType') && order.RateType.type != undefined ) ? 
      order.RateType.type : order.rate.RateType.type);
    

    const senderGeographyId = await this._returnGUID(order.addressDetailsFrom);
    const recipientGeographyId = await this._returnGUID(order.addressDetailsTo);

    let typeOfCargoId = false;
    if (packageType && typeof(packageType) != undefined) {
      typeOfCargoId = await this._returnTypeOfCargoId(packageType, instance);
    }

    let urgencyId = false;
    if ( rateType && typeof(rateType) != undefined) {
      urgencyId = await this._returnUrgencyId(rateType, instance, inCityDelivery);
    }

    const packagesWeight = packages.reduce((a, v) => a + (v.price.calcWeight * v.quantity), 0); 
    const packagesQty = packages.reduce((a, v) => a + v.quantity, 0);
    const declaredValue = order.declaredValue ? order.declaredValue : 0;

    let serviceInsurance = false;
    let serviceCashAssigment = false;
    let serviceNotification = false;

    // if (order.hasOwnProperty('OrderServices')) {
    //   if (order.OrderServices.findIndex((s) => s.action == 'insurance') > -1) {
    //     // serviceInsurance = true;
    //     console.warn('Order with insurance, but insurance has been disabled...')
    //   }
  
    //   if (order.OrderServices.findIndex((s) => s.action == 'cash_assigment') > -1) {
    //     serviceCashAssigment = true;
    //   }
  
    //   if (order.OrderServices.findIndex((s) => s.action == 'notification') > -1) {
    //     serviceNotification = true;
    //   }
    // }
    // varName           varType  required  value
    // DeclaredValueRate decimal    Нет     Объявленная стоимость груза
    // InsuranceRate     decimal    Нет     Страховая стоимость груза
    // Service           string     Нет     GUID услуги из нашей системы
    // Countingresults   boolean    Нет     Признак суммирования услуги и дополнительной услуги
    
    const xml = `<soap:Envelope xmlns:soap="http://www.w3.org/2003/05/soap-envelope">
      <soap:Header/>
      <soap:Body>
      <m:Calc xmlns:m="http://www.cargo3.ru">
      <m:login>${this._encodeXMLParam(this.login)}</m:login>
      <m:password>${this._encodeXMLParam(this.password)}</m:password>
      <m:data>
      <m:Key>Destinations</m:Key>
      <m:List>
      <m:Key>Destination</m:Key>
      <m:Fields>
      <m:Key>SenderGeography</m:Key>
      <m:Value>${senderGeographyId}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>RecipientGeography</m:Key>
      <m:Value>${recipientGeographyId}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>` +
      (typeOfCargoId ? `
      <m:Fields>
      <m:Key>TypeOfCargo</m:Key>
      <m:Value>${typeOfCargoId}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      `  : '') + 
      (!!urgencyId ? `
      <m:Fields>
      <m:Key>Urgency</m:Key>
      <m:Value>${urgencyId}</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>
      `  : '') + `
      <m:Fields>
      <m:Key>Weight</m:Key>
      <m:Value>${packagesWeight}</m:Value>
      <m:ValueType>float</m:ValueType>
      </m:Fields>
      <m:Fields>
      <m:Key>Qty</m:Key>
      <m:Value>${packagesQty}</m:Value>
      <m:ValueType>int</m:ValueType>
      </m:Fields>

      <m:Fields>
      <m:Key>DeliveryType</m:Key>
      <m:Value>ДоставкаДоДверей</m:Value>
      <m:ValueType>string</m:ValueType>
      </m:Fields>

      <m:Fields>
      <m:Key>CountOnlyAddServices</m:Key>
      <m:Value>false</m:Value>
      <m:ValueType>boolean</m:ValueType>
      </m:Fields>
      <m:Tables>
      <m:Key>AdditionalServices</m:Key>

      </m:Tables>
      </m:List>
      </m:data>
      <m:parameters xmlns:xs="http://www.w3.org/2001/XMLSchema"
      xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
      <m:Key>Parameters</m:Key>
      <m:List>
      <m:Key>countingresults</m:Key>
      <m:Value>true</m:Value>
      <m:ValueType>boolean</m:ValueType>
      </m:List>
      </m:parameters>
      </m:Calc>
      </soap:Body>
      </soap:Envelope>`;

    let res = await this._makeRequest(xml, true, (3600000 * 24 * 1));
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    
    let ratesList = res['soap:Envelope']['soap:Body']['m:CalcResponse']['m:return']['m:List']['m:List'];
    if (ratesList == undefined) {
      let errorList = res['soap:Envelope']['soap:Body']['m:CalcResponse']['m:return']['m:List'];
      if (Array.isArray(errorList)) {
        let error = errorList[0]['m:Properties'];
        let errorCode = error['m:List']['m:Value']['_text'];
        let errorDescription = error['m:List']['m:List']['m:Value']['_text'];
        console.warn('getRate returned ERROR: Ошибка', errorCode, errorDescription);
        console.warn('REQ (RAW): ');
        console.warn(xml);
      } else {
        ratesList = null;
      }
    }

    let stop = new Date();
    let runningTime = (stop - start) / 1000;
    console.log('time spent: ', runningTime);

    if (!ratesList) {
      console.warn('CSE No rates found for this rateParameters...');

      return rates;
    }

    Array.isArray(ratesList) ?
      rates = ratesList.map((rate) => this._formatRate(rate)) :
      rates =  this._formatRate(ratesList);

    return rates;
  }
}

module.exports = CseAPI;