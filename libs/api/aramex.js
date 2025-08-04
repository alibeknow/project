const config = require('../../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

const cyrillicToTranslit = require('cyrillic-to-translit-js');
const translatte = require('translatte');
const translated = require('./shared/cities');

const soap = require('strong-soap').soap;

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


class AramexAPI {
  constructor(args = {}) {
    const { clientInfo = null, test = false } = args;

    this.test = test;
    if (this.test) {
      this.clientInfo = {
        UserName: 'testingapi@aramex.com',
        Password: 'R123456789$r',
        Version: 'v1.0',
        AccountNumber: '20016',
        AccountPin: '331421',
        AccountEntity: 'AMM',
        AccountCountryCode: 'JO'
      };
    } else {
      this.clientInfo = clientInfo;
    }

    this.requestsLog = [];
  }

  async create(order) {
    const ret = await this.createOrder(order);
    if (ret.shipments.HasErrors || ret.pickup.HasErrors) throw Error(JSON.stringify(ret));
    console.log('RAW ret:', JSON.stringify(ret));

    const id = ret['shipments']['Shipments']['ProcessedShipment'][0]['ID'];

    const waybill = await this.getWaybill(ret['shipments']['Shipments']['ProcessedShipment'][0]['ID']);
    if (waybill.HasErrors) throw Error(JSON.stringify(waybill));
    console.log('RAW waybill:', JSON.stringify(waybill));


    const data = waybill['ShipmentLabel']['LabelFileContents'];

    return {
      id,
      waybill: data,
    }
  }

  async track(id) {
    let orderStatus = null;
    let status = null;

    const ret = await this.getDeliveryStatus(id);
    console.log('ret:', JSON.stringify(ret));
    
    if (ret.HasErrors) throw Error(JSON.stringify(ret));
    
    if (!ret.HasErrors && ret.TrackingResults) {
      status = ret['TrackingResults']['KeyValueOfstringArrayOfTrackingResultmFAkxlpY'][0]['Value']['TrackingResult'][0]['UpdateCode'];
      // console.log('status:', status);
    
      // SH014 - Record created.
      // SH308 - Pickup Scheduled
      // SH012 - Picked Up From Shipper
      // SH005 - Delivered
    
      if (['SH005'].indexOf(status) > -1) {
        orderStatus = 'delivered';
      } else if (['SH014', 'SH308'].indexOf(status) > -1) {
        orderStatus = 'confirmed';
      } else {
        orderStatus = 'in_transit';
      }
    }

    return {
      orderStatus,
      status,
    };
  }

  async _makeRequest(api, method, args) {
    return new Promise((resolve, reject) => {
      soap.createClient(__dirname + '/wsdl-aramex/' + api + '-api-wsdl.wsdl' + (this.test ? '.test' : ''), async (err, client) => {
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
          });

          resolve(result);
        } catch (err) {
          console.log(err);
          reject('Error happened connecting to Aramex soap!');
        }
      });
    });
  }

  async getRequestsLog() {
    return this.requestsLog;
  }

  async _validateAddress(address) {

    let countryCode = address.CountryCode;
    let postCode = address.PostCode;
    let city = address.City;
    let stateOrProvince = address.StateOrProvinceCode;
    if (postCode == '050000') postCode = '050039'; // cause 050000 is banned due to the parallel import issue
    if (config.type == 'bestsender' && countryCode == 'RU' || countryCode == 'BY') {
      countryCode = 'KZ';
      postCode = '071000';
      city = 'Алматы';
      stateOrProvince = '';
      // console.log('Parallel import address translation task has been started...');
      // console.log(address.CountryCode, ' => ',  countryCode);
    } else {
      // console.log('Ordinary delivery');
    }

    if (city != '' && !isASCII(city)) {
      city = trim(city, 'г.');
      city = await translate(city.trim());
      city = trim(city, '.');
    }
    if (stateOrProvince != '' && !isASCII(stateOrProvince)) {
      stateOrProvince = await translate(stateOrProvince);
    }

    let res = {
      Line1: translit(address.Line1),
      Line2: translit(address.Line2),
      Line3: address.PostCode + ', ' + address.CountryCode + ', ' +  address.City,
      City: city,
      StateOrProvinceCode: stateOrProvince,
      PostCode: postCode,
      CountryCode: countryCode,
    };
    // console.log('_validateAddress:', res);

    return res;
  }

  async createOrder(order) {
    const pickup = await this.createPickup(order);
    const shipments = await this.createShipments(order, pickup);

    if (shipments.HasErrors && !pickup.HasErrors) {
      //console.log('shipments have errors, canceling a pickup...');
      await this.cancelPickup(pickup);
    }

    return {
      pickup,
      shipments,
    };
  }

  async createShipments(order, pickup) {

    const productGroup = order.addressDetailsTo.countryCode == 'RU' ? 
    'DOM' :
    ((order.percentVAT > 0) ? 'DOM' : 'EXP');

		const productType = order.addressDetailsTo.countryCode == 'RU' ?
		'ONP' : (order.percentVAT > 0) ? 'ONP' : (order.PackageType.type == 'documents') ? 'PDX' : 'PPX'

    let addressFrom = await this._validateAddress({
      Line1: order.addressDetailsFrom.addressLine1,
      Line2: order.addressDetailsFrom.addressLine2,
      Line3: '',
      City: order.addressDetailsFrom.city,
      StateOrProvinceCode: order.addressDetailsFrom.province,
      PostCode: order.addressDetailsFrom.postCode,
      CountryCode: order.addressDetailsFrom.countryCode,
    });
    let addressTo = await this._validateAddress({
      Line1: order.addressDetailsTo.addressLine1,
      Line2: order.addressDetailsTo.addressLine2,
      Line3: '',
      City: order.addressDetailsTo.city,
      StateOrProvinceCode: order.addressDetailsTo.province,
      PostCode: order.addressDetailsTo.postCode,
      CountryCode: order.addressDetailsTo.countryCode,
    });

    const args = {
      ShipmentCreationRequest: {
        ClientInfo: this.clientInfo,
        Shipments: {
          Shipment: {
            Shipper: {
              Reference1: pickup['ProcessedPickup']['ID'],
              Reference2: '',
              //AccountNumber: '',
              AccountNumber: this.clientInfo.AccountNumber,
              PartyAddress: addressFrom,
              Contact: {
                Department: '',
                PersonName: translit(order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName),
                Title: '',
                CompanyName: order.addressDetailsFrom.companyName ? translit(order.addressDetailsFrom.companyName) : translit(order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName),
                PhoneNumber1: order.addressDetailsFrom.phone,
                PhoneNumber1Ext: '',
                PhoneNumber2: '',
                PhoneNumber2Ext: '',
                FaxNumber: '',
                CellPhone: order.addressDetailsFrom.phone,
                EmailAddress: order.addressDetailsFrom.email,
                Type: '',
              },
            },
            Consignee: {
              Reference1: order.id,
              Reference2: order.refNo,
              //AccountNumber: '',
              //AccountNumber: this.clientInfo.AccountNumber,
              PartyAddress: addressTo,
              Contact: {
                Department: '',
                PersonName: translit(order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName),
                Title: '',
                CompanyName: order.addressDetailsTo.companyName ? translit(order.addressDetailsTo.companyName) : translit(order.addressDetailsTo.firstName + ' ' + order.addressDetailsTo.lastName),
                PhoneNumber1: order.addressDetailsTo.phone,
                PhoneNumber1Ext: '',
                PhoneNumber2: '',
                PhoneNumber2Ext: '',
                FaxNumber: '',
                CellPhone: order.addressDetailsTo.phone,
                EmailAddress: order.addressDetailsTo.email,
                Type: '',
              },
            },
            ThirdParty: {
              Reference1: '',
              Reference2: '',
              AccountNumber: '',
              PartyAddress: {
                Line1: '',
                Line2: '',
                Line3: '',
                City: '',
                StateOrProvinceCode: '',
                PostCode: '',
                CountryCode: '',
              },
              Contact: {
                Department: '',
                PersonName: '',
                Title: '',
                CompanyName: '',
                PhoneNumber1: '',
                PhoneNumber1Ext: '',
                PhoneNumber2: '',
                PhoneNumber2Ext: '',
                FaxNumber: '',
                CellPhone: '',
                EmailAddress: '',
                Type: '',
              },
            },
            Reference1: order.refNo,
            Reference2: '',
            Reference3: '',
            ForeignHAWB: '',
            TransportType: 0,
            ShippingDateTime: moment(order.pickupTime).format('YYYY-MM-DD') == moment().format('YYYY-MM-DD') ? moment(order.pickupTime).format('YYYY-MM-DD') + 'T' + moment().add(61, 'minutes').format('HH:mm:ss') + 'Z' : moment(order.pickupTime).format('YYYY-MM-DD') + 'T10:00:00Z',
            DueDate: moment(order.pickupTime).add((order.percentVAT > 0) ? 1 : 3, 'day').format('YYYY-MM-DD') + 'T10:00:00Z',
            PickupLocation: 'Reception',
            PickupGUID: pickup['ProcessedPickup']['GUID'],
            Comments: translit(order.externalComment),
            AccountingInstrcutions: '',
            OperationsInstructions: '',
            Details: {
              Dimensions: {
                Length: order.Packages[0].depth,
                Width: order.Packages[0].width,
                Height: order.Packages[0].height,
                Unit: 'Cm'
              },
              ActualWeight: {
                Value: order.Packages.map((p) => p.weight).reduce((a, v) => a + v, 0),
                Unit: 'Kg'
              },
              ChargeableWeight: {
                Value: order.Packages.map((p) => Math.max(p.weight, p.volumeWeight)).reduce((a, v) => a + v, 0),
                Unit: 'Kg'
              },
              ProductGroup: productGroup,
              ProductType: productType,
              PaymentType: 'P',
              PaymentOptions: '',
              Services: '',
              NumberOfPieces: order.Packages.map((p) => p.quantity).reduce((a, v) => a + v, 0),
              DescriptionOfGoods: translit(order.contents),
              GoodsOriginCountry: '',
              CashOnDeliveryAmount: {
                Value: 0,
                CurrencyCode: ''
              },
              InsuranceAmount: {
                Value: 0,
                CurrencyCode: ''
              },
              CollectAmount: {
                Value: 0,
                CurrencyCode: ''
              },
              CashAdditionalAmount: {
                Value: 0,
                CurrencyCode: ''
              },
              CashAdditionalAmountDescription: '',
              CustomsValueAmount: {
                Value: order.declaredValue,
                CurrencyCode: 'KZT'
              },
              Items: '',
              /*Items: {
                ShipmentItem: [
                  {
                    $value: {
                      PackageType: 'Box',
                      Quantity: 1,
                      Weight: {
                        Value: 0.5,
                        Unit: 'Kg'
                      },
                      Comments: 'Comments',
                      Reference: ''
                    }
                  }
                ]
              },*/
            },
          }
        }
      }
    };

    //console.log('CreateShipments:', args);

    const res = await this._makeRequest('shipping-services', 'CreateShipments', args);
    return res;
  }

  async createPickup(order) {
    let addressFrom = await this._validateAddress({
      Line1: order.addressDetailsFrom.addressLine1,
      Line2: order.addressDetailsFrom.addressLine2,
      Line3: '',
      City: order.addressDetailsFrom.city,
      StateOrProvinceCode: order.addressDetailsFrom.province,
      PostCode: order.addressDetailsFrom.postCode,
      CountryCode: order.addressDetailsFrom.countryCode,
    });

    const args = {
      PickupCreationRequest: {
        ClientInfo: this.clientInfo,
        Transaction: null,
        Pickup: {
          PickupAddress: addressFrom,
          PickupContact: {
            Department: '',
            PersonName: translit(order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName),
            Title: '',
            CompanyName: order.addressDetailsFrom.companyName ? translit(order.addressDetailsFrom.companyName) : translit(order.addressDetailsFrom.firstName + ' ' + order.addressDetailsFrom.lastName),
            PhoneNumber1: order.addressDetailsFrom.phone,
            PhoneNumber1Ext: '',
            PhoneNumber2: '',
            PhoneNumber2Ext: '',
            FaxNumber: '',
            CellPhone: order.addressDetailsFrom.phone,
            EmailAddress: order.addressDetailsFrom.email,
            Type: '',
          },
          PickupLocation: 'Reception',
          PickupDate: moment(order.pickupTime).format('YYYY-MM-DD') == moment().format('YYYY-MM-DD') ? moment(order.pickupTime).format('YYYY-MM-DD') + 'T' + moment().add(61, 'minutes').format('HH:mm:ss') + 'Z' : moment(order.pickupTime).format('YYYY-MM-DD') + 'T10:00:00Z',
          ReadyTime: moment(order.pickupTime).format('YYYY-MM-DD') == moment().format('YYYY-MM-DD') ? moment(order.pickupTime).format('YYYY-MM-DD') + 'T' + moment().add(61, 'minutes').format('HH:mm:ss') + 'Z' : moment(order.pickupTime).format('YYYY-MM-DD') + 'T10:00:00Z',
          LastPickupTime: moment(order.pickupTime).format('YYYY-MM-DD') + 'T17:00:00Z',
          ClosingTime: moment(order.pickupTime).format('YYYY-MM-DD') + 'T17:00:00Z',
          Comments: translit(order.externalComment),
          Reference1: order.refNo,
          Reference2: '',
          Vehicle: '',
          Shipments: '',
          /*Shipments: {
            ShipmentItem: [
              {
                $value: {
                  PackageType: 'Box',
                  Quantity: 1,
                  Weight: {
                    Value: 0.5,
                    Unit: 'Kg'
                  },
                  Comments: 'Docs',
                  Reference: ''
                }
              }
            ]
          },*/
          PickupItems: {
            PickupItemDetail: [
              {
                $value: {
                  ProductGroup: (order.percentVAT > 0) ? 'DOM' : 'EXP',
                  ProductType: (order.percentVAT > 0) ? 'ONP' : (order.PackageType.type == 'documents') ? 'PDX' : 'PPX',
                  NumberOfShipments: 1,
                  PackageType: (order.PackageType.type == 'documents') ? 'Letter' : 'Box',
                  Payment: 'P',
                  ShipmentWeight: {
                    Value: order.Packages.map((p) => p.weight).reduce((a, v) => a + v, 0),
                    Unit: 'Kg'
                  },
                  ShipmentVolume: {
                    Value: order.Packages.map((p) => (p.width * p.height * p.depth).toFixed(2)).reduce((a, v) => a + v, 0),
                    Unit: 'Cm3'
                  },
                  NumberOfPieces: order.Packages.map((p) => p.quantity).reduce((a, v) => a + v, 0),
                  CashAmount: {
                    Value: 0,
                    CurrencyCode: ''
                  },
                  ExtraCharges: {
                    Value: 0,
                    CurrencyCode: ''
                  },
                  ShipmentDimensions: {
                    Length: order.Packages[0].depth,
                    Width: order.Packages[0].width,
                    Height: order.Packages[0].height,
                    Unit: 'Cm'
                  },
                  Comments: translit(order.externalComment),
                }
              }
            ],
          },
          Status: 'Ready',
        },
        LabelInfo: {
          ReportID: 9201,
          ReportType: 'RPT',
        },
      }
    };

    //console.log('CreatePickup:', args);

    const res = await this._makeRequest('shipping-services', 'CreatePickup', args);
    return res;
  }

  async cancelPickup(pickup) {
    const args = {
      PickupCancelationRequest: {
        ClientInfo: this.clientInfo,
        Transaction: null,
        PickupGUID: pickup['ProcessedPickup']['GUID'],
        Comments: '',
      }
    };

    //console.log('CancelPickup:', args);

    const res = await this._makeRequest('shipping-services', 'CancelPickup', args);
    return res;
  }

  async getWaybill(tracking) {
    const args = {
      LabelPrintingRequest: {
        ClientInfo: this.clientInfo,
        Transaction: null,
        ShipmentNumber: tracking,
        ProductGroup: '',
        OriginEntity: '',
        LabelInfo: {
          ReportID: 9201,
          ReportType: 'RPT',
        },
      }
    };

    const res = await this._makeRequest('shipping-services', 'PrintLabel', args);
    return res;
  }

  async getDeliveryStatus(tracking) {
    const args = {
      ShipmentTrackingRequest: {
        ClientInfo: this.clientInfo,
        Transaction: null,
        Shipments: {
          string: [
            {
              $value: tracking,
            },
          ],
        },
        GetLastTrackingUpdateOnly: false,
      }
    };

    const res = await this._makeRequest('shipments-tracking', 'TrackShipments', args);
    return res;
  }

  async getCountries() {
    const args = {
      CountriesFetchingRequest: {
        ClientInfo: this.clientInfo,
        Transaction: null,
      }
    };

    const res = await this._makeRequest('location', 'FetchCountries', args);
    return res;
  }

  async getCountry(countryCode) {
    const args = {
      CountryFetchingRequest: {
        ClientInfo: this.clientInfo,
        Transaction: null,
        Code: countryCode,
      }
    };

    const res = await this._makeRequest('location', 'FetchCountry', args);
    return res;
  }

  async getCities(countryCode, name = '', state = '') {
    const args = {
      CitiesFetchingRequest: {
        ClientInfo: this.clientInfo,
        Transaction: null,
        CountryCode: countryCode,
        State: state,
        NameStartsWith: name,
      }
    };

    const res = await this._makeRequest('location', 'FetchCities', args);
    return res;
  }

  async getOffices(countryCode) {
    const args = {
      OfficesFetchingRequest: {
        ClientInfo: this.clientInfo,
        Transaction: null,
        CountryCode: countryCode,
      }
    };

    const res = await this._makeRequest('location', 'FetchOffices', args);
    return res;
  }

  async validateAddress(address = {
    Line1: '',
    Line2: '',
    Line3: '',
    City: '',
    StateOrProvinceCode: '',
    PostCode: '',
    CountryCode: '',
  }) {
    const args = {
      AddressValidationRequest: {
        ClientInfo: this.clientInfo,
        Transaction: null,
        Address: address,
      }
    };

    const res = await this._makeRequest('location', 'ValidateAddress', args);
    return res;
  }
}

module.exports = AramexAPI;