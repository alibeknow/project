const config = require('../../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

const soap = require('strong-soap').soap;
const convert = require('xml-js');
const fetch = require('isomorphic-unfetch');

class PonyExpressAPI {
  constructor(args = {}) {
    const { accessKey = '00000000-0000-0000-0000-000000000000', test = false } = args;

    this.accessKey = accessKey;
    this.test = test;
    this.requestsLog = [];
  }

  async create(order) {
    const ret = await this.createOrder(order);
   
    let id;
    try {
      id = ret['Response']['OrderList']['Order']['ServiceList']['Service']['Waybill']['Number']['_text'];
    } catch (e) {
      throw Error('Order Error: ' + JSON.stringify(e) + ' Responce:' + JSON.stringify(ret));
    }

    const waybill = await this.getWaybill(id);
    console.log('waybill:', JSON.stringify(waybill));

    let waybillURL;
    try {
      waybillURL = waybill['Response']['FileUri']['_text'];
    } catch (e) {
      throw Error('Order Error: ' + JSON.stringify(e) + ' Responce:' + JSON.stringify(waybill));
    }

    let data;
    try {
      const response = await fetch(waybillURL);
      const buffer = await response.buffer();
      data = buffer.toString('base64');
    } catch(e) {
      throw Error('Order Error: ' + JSON.stringify(e));
    }

    return {
      id,
      waybill: data,
    }
  }

  async track(id) {
    let orderStatus = null;
    let status = null;

    const ret = await this.getDeliveryStatus(id);
    // console.log('ret:', JSON.stringify(ret));

    const deliveryStatus = ret['Response']['OrderList']['Order']['ServiceList']['Service']['StatusList']['ServiceStatus'];
    if (deliveryStatus && Array.isArray(deliveryStatus)) {
      status = deliveryStatus.pop();
      status = status['Code']['_text'];
      
      if ([
          'Delivered',
          // 'OnLastMile',
    ].indexOf(status) > -1) {
        orderStatus = 'delivered';
      } else if (['ReturnedToSender'].indexOf(status) > -1) {
        orderStatus = 'returned';
      // } else if (['Problem'].indexOf(status) > -1) {
        // orderStatus = 'attention';
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

  async _makeRequest(method, args) {
    return new Promise((resolve, reject) => {
      soap.createClient('https://svc-api.p2e.ru/UI_Service.svc?singleWsdl', async (err, client) => {
        client.on('request', (request) => {
          // console.log(request);
        });

        try {
          const { result, envelope, soapHeader } = await client[method](args);
          //console.log(soapHeader);
          //console.log(envelope);

          this.requestsLog.push({
            date: new Date(),
            req: {
              method,
              args,
            },
            res: {
              soapHeader,
              envelope,
              result,
            },
          });

          resolve(result);
        } catch (err) {
          console.log(err);
          reject('Error happened connecting to PonyExpress soap!');
        }
      });
    });
  }

  async getRequestsLog() {
    return this.requestsLog;
  }

  async submitRequest(request) {
    const args = {
      accesskey: this.accessKey,
      requestBody: request,
    };

    let res = await this._makeRequest('SubmitRequest', args);
    res = res['SubmitRequestResult'];
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
    return res;
  }

  _generatePackagesSegment(order) {
    //if (order.PackageType.type == 'documents') {
    let counter = 0;
    
    return order.Packages.map((_package) => {
      let res = '';

      for (let i = 0; i < _package.quantity; i++) {
        counter++;
        res = res + `
          <Cargo> <!--Required at least one-->
            <Id>${counter}</Id> <!--Optional-->
            <Barcode>${String(order.id).padStart(6, "0")}${String(counter).padStart(2, "0")}</Barcode> <!--Required if CargoList contain more than one Cargo-->
            <Description>${this._encodeXMLParam((order.PackageType.type == 'documents') ? 'Документы/печатная продукция' : order.contents)}</Description> <!--Optional-->
            ` + ((order.PackageType.type == 'documents') ? `
            <Packing> <!--Optional-->
              <Type>Envelope</Type> <!--Required if parent node present-->
            </Packing>
            `: `
            <Packing> <!--Optional-->
              <Type>Box</Type> <!--Required if parent node present-->
            </Packing>
            <Dimentions> <!--Optional-->
              <Length>${parseInt(_package.depth * 10)}</Length> <!--Required if parent node present-->
              <Width>${parseInt(_package.width * 10)}</Width> <!--Required if parent node present-->
              <Height>${parseInt(_package.height * 10)}</Height> <!--Required if parent node present-->
            </Dimentions>`) + `
            <Weight>${parseInt(_package.weight * 1000)}</Weight> <!--Required-->
          </Cargo>
        `;
      }

      return res;
    }).reduce((a, v) => a + v, '');
  }
  
  async createOrder(order) {
    let serviceNotification = false;
    if (order.OrderServices.findIndex((s) => s.action == 'notification') > -1) {
      serviceNotification = true;
    }

    const xml = `<?xml version="1.0" encoding="utf-8"?>
      <Request xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="OrderRequest">
        <Mode>Order</Mode> <!--Required-->
        <OrderList> <!--Required-->
          <Order> <!--Required-->
            <ClientsNumber>${this._encodeXMLParam(order.refNo)}${this.test ? '-' + Math.random() : ''}</ClientsNumber> <!--Optional-->
            <Payment> <!--Required-->
              <Mode>${this.test ? 'Bill' : 'BillBySender'}</Mode> <!--Required-->
            </Payment>
            <ServiceList> <!--Required-->
              <Service xsi:type="DeliveryService"> <!--Required-->
                <PickupDate>${moment(order.pickupTime).format('YYYY-MM-DD')}T10:00:00+06:00</PickupDate> <!--Optional-->
                <Mode>${order.RateType.type == 'express' ? 'Express' : 'Econom'}</Mode> <!--Optional-->
                <Sender> <!--Required-->
                  <Address> <!--Required-->
                    <Country>${this._encodeXMLParam(order.addressDetailsFrom.country)}</Country> <!--Optional-->
                    <Region>${this._encodeXMLParam(order.addressDetailsFrom.province)}</Region> <!--Optional-->
                    <District> </District> <!--Optional-->
                    <PostCode>${order.addressDetailsFrom.postCode}</PostCode> <!--Optional-->
                    <City>${this._encodeXMLParam(order.addressDetailsFrom.city)}</City> <!--Required-->
                    <StreetAddress>${this._encodeXMLParam(order.addressDetailsFrom.addressLine1 + (order.addressDetailsFrom.addressLine2 ? ` ${order.addressDetailsFrom.addressLine2}`: ''))}</StreetAddress> <!--Required-->
                  </Address>
                  <Company> <!--Required-->
                    <Name>${this._encodeXMLParam(order.addressDetailsFrom.companyName ? order.addressDetailsFrom.companyName : order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName)}</Name> <!--Required-->
                  </Company>
                  <PersonList> <!--Required-->
                    <Person> <!--Required at least one-->
                      <Name>${this._encodeXMLParam(order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName)}</Name> <!--Required-->
                      <PhoneList> <!--Required-->
                        <string>${this._encodeXMLParam(order.addressDetailsFrom.phone)}</string> <!--Required at least one-->
                      </PhoneList>
                    </Person>
                  </PersonList>
                  <Unformalized>${serviceNotification ? 'Услуга уведомление о вручении / ' : ''}${this._encodeXMLParam(order.externalComment)}</Unformalized> <!--Optional-->
                </Sender>
                <Recipient> <!--Required-->
                  <Address> <!--Required-->
                    <Country>${this._encodeXMLParam(order.addressDetailsTo.country)}</Country> <!--Optional-->
                    <Region>${this._encodeXMLParam(order.addressDetailsTo.province)}</Region> <!--Optional-->
                    <District> </District> <!--Optional-->
                    <PostCode>${order.addressDetailsTo.postCode}</PostCode> <!--Optional-->
                    <City>${this._encodeXMLParam(order.addressDetailsTo.city)}</City> <!--Required-->
                    <StreetAddress>${this._encodeXMLParam(order.addressDetailsTo.addressLine1 + (order.addressDetailsTo.addressLine2 ? ` ${order.addressDetailsTo.addressLine2}`: ''))}</StreetAddress> <!--Required-->
                  </Address>
                  <Company> <!--Required-->
                    <Name>${this._encodeXMLParam(order.addressDetailsTo.companyName ? order.addressDetailsTo.companyName : order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName)}</Name> <!--Required-->
                  </Company>
                  <PersonList> <!--Required-->
                    <Person> <!--Required at least one-->
                      <Name>${this._encodeXMLParam(order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName)}</Name> <!--Required-->
                      <PhoneList> <!--Required-->
                        <string>${this._encodeXMLParam(order.addressDetailsTo.phone)}</string> <!--Required at least one-->
                      </PhoneList>
                    </Person>
                  </PersonList>
                </Recipient>
                <CargoList> <!--Required-->
                ${this._generatePackagesSegment(order)}
                </CargoList>
                <Unformalized></Unformalized> <!--Optional-->
                ` + 
                ( serviceNotification ? `
                  <AdditionalServices> <!--Optional-->
                    <DeliveryAdditionalService> <!--Optional-->
                      <Code>1182</Code> <!--Required if parent node present-->
                    </DeliveryAdditionalService>
                  </AdditionalServices>
                ` : '' )
                + /* <AdditionalServices> <!--Optional-->
                  <DeliveryAdditionalService> <!--Optional-->
                    <Code>1015</Code> <!--Required if parent node present-->
                  </DeliveryAdditionalService>
                  <DeliveryAdditionalService>
                    <Code>1017</Code>
                  </DeliveryAdditionalService>
                  <DeliveryAdditionalService> <!--Optional-->
                    <Code>1019</Code> <!--Required if parent node present-->
                    <Parameters> <!--Optional-->
                      <ServiceParameter xsi:type="CountParameter"> <!--Optional-->
                        <Count>10</Count> <!--Required if parent node present-->
                      </ServiceParameter>
                    </Parameters>
                  </DeliveryAdditionalService>          
                  <DeliveryAdditionalService>
                    <Code>1013</Code>
                    <Parameters>
                      <ServiceParameter xsi:type="AddressParameter">
                        <Country>Россия</Country>
                        <Region>Московская область</Region>
                        <District>Одинцовский</District>
                        <PostCode>111631</PostCode>
                        <City>Одинцово</City>
                        <StreetAddress>Белорусская 4 -125</StreetAddress>
                      </ServiceParameter>
                    </Parameters>
                  </DeliveryAdditionalService>              
                </AdditionalServices> */ `
              </Service>
            </ServiceList>
          </Order>
        </OrderList>
      </Request>
    `;

    console.log(xml);
    
    return await this.submitRequest(xml);
  }

  async getWaybill(waybillNumber) {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
    <Request xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="PrintRequest">
        <PrintType>1</PrintType> <!--Optional-->
        <NoCheck>1</NoCheck> <!--Optional-->
        <StickerType>0</StickerType> <!--Optional-->
        <WaybillNumberList> <!--Required-->
            <string>${waybillNumber}</string> <!--Required at least one-->
        </WaybillNumberList>
    </Request>`;

    return await this.submitRequest(xml);
  }

  async getDeliveryStatus(waybillNumber) {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
    <Request xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xsi:type="OrderRequest">
        <Mode>Status</Mode> <!--Required-->
        <OrderList> <!--Required-->
            <Order> <!--Required-->
                <ServiceList> <!--Required-->
                    <Service xsi:type="DeliveryService"> <!--Required-->
                        <Waybill> <!--Required-->
                            <Number>${waybillNumber}</Number> <!--Required-->
                        </Waybill>
                    </Service>
                </ServiceList>
            </Order>
        </OrderList>
    </Request>`;
    
    return await this.submitRequest(xml);
  }
}

module.exports = PonyExpressAPI;

/*
(async() => {
  const api = new PonyExpressAPI({ accessKey: '39a18951-636f-464e-b97d-0d6c7bf9573c' });

  let xml = `<?xml version="1.0" encoding="utf-8"?>
  <Request xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:type="HistoryRequest">
  <Id>3</Id>
  <DateFrom>2021-02-01T00:00:00+04:00</DateFrom>
  <DateTo>2021-02-20T00:00:00+04:00</DateTo>
  </Request>`;

  let res = await api.submitRequest(xml);
  console.log(JSON.stringify(res));

  let res2 = await api.getRequestsLog();
  console.log(res2);

})();
*/