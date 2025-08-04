const config = require('../../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

const fetch = require('isomorphic-unfetch');
const convert = require('xml-js');
const { random } = require('lodash');


class EmsAPI {
  constructor(args = {}) {
    const { 
        apiKey = config.ems.apiKey,
        dea_number = config.ems.dea_number,
        dea_code = config.ems.dea_code,
        bin = config.ems.bin,
        username = config.ems.username,
        password = config.ems.password,
        test = config.ems.test,

    } = args;
    this.apiKey = apiKey;
    this.dea_number = dea_number;
    this.dea_code  = dea_code;
    this.bin = bin;
    this.username = username;
    this.password = password;
    this.test = test;
    //this.test = true;

    this.requestsLog = [];
  }

  async create(order) {
    const ret = await this.createOrder(order);
	
	try {
	  const res = await this._createCourierRequest(order);
	} catch {
	  console.warn('Courier request failed! ');
	}
    
    let code = Number(ret['ns2:ResponseInfo']['ns2:ResponseCode']._text);
    let codeInfo = ret['ns2:ResponseInfo']['ns2:ResponseText']._text;
    if (!!code){// placed order returns code 0
      // throw Error(code + ': ' + codeInfo); 
      console.warn('Error code: ' + code + ': ' + '. Error message: ' + codeInfo); 
    } 

    const id = ret['ns2:Barcodes']._text;
    const data = this.test ? null : ret['ns2:AddrLetPdfs']._text;
    // const data = this.test ? null : ret['ns2:AddrLetPdf']._text;


    console.log('Respoonce code ' + code + ': ' + codeInfo); 
    // console.log(code + ': ' + !!code); 

    return {
      id,
      waybill: data,
    };
  }

  async track(id) {

    let orderStatus = null;
    let status = null;

    const url = `https://${ this.test ? 'pls-test': 'track' }.post.kz/api/v2/${id}/events`;
    let response = await fetch(url);
    let json = await response.json();
    // console.log('tracking: ', JSON.stringify(json));

    if (!json.error & Array.isArray(json.events)) {        
      status = json.events[0].activity[0].status[0];

      if ([
          'DLV_HAND',
          'DPAY',
          'DPAY_O',
          'DPAY_I',
          'ISSPAY',
          'ISSPAY_O',
          'ISSPAY_I',
          'ISSSC_O',
          'ISSSC_I',
          'DLV_POBOX_O',
          'DLV_POBOX_I',
          'Handed',
        ].indexOf(status) > -1) {
        orderStatus = 'delivered';
      } else if ([
        'RET_O',
        'RETSTR_O',
        'RETSC_O',
        'RET_I',
        'RETSTR_I',
        'RETSC_I',
        ].indexOf(status) > -1) {
        orderStatus = 'returned';
      } else if ([
          'EMH',
          'EXB',
        ].indexOf(status) > -1) {
        orderStatus = 'attention';
      } else if ([
          'UTL',
          'Destroyed',
        ].indexOf(status) > -1) {
        orderStatus = 'destroyed';
      } else {
        orderStatus = 'in_transit';
      }
      
    } else {
      // throw Error(JSON.stringify(json)); 
      console.warn('Tracking error: ', JSON.stringify(json));
    }
    // console.log(orderStatus, status );

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
    const url = `http://rates.kazpost.kz/postrates${ this.test ? 'ws' : 'prod' }/postratesws.wsdl`;  
    // console.warn('Making req to url ', url)
    
    const res = await fetch(url, {
      method: 'POST',
      body: xml,
      headers: {
        'Content-Type': 'text/xml',
      },
    });

    const text = await res.text();

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

  async createOrder(order) {

    let serviceCode = '';
    let sendMethod = '';
    let declaredValue = '0';
    let mailCategory = '1'; 
    // 1 = registered, 
    // 2 = with declared value
    // 4 = with declared value & c-o-d

    if (order.RateType.type == 'express') {
	    serviceCode = 'P15' + Number( order.PackageType.type == 'box' );
      sendMethod = '2'; //by avia
    } else if (order.RateType.type == 'economy') {
      serviceCode = 'P154';
      sendMethod = '1'; //by car
    } else throw Error('createOrder: wrong serviceCode and sendMethod');

	// console.warn('serviceCode', serviceCode);

    let serviceNotification = false;
    if (order.OrderServices.findIndex((s) => s.action == 'notification') > -1) {
      serviceNotification = true;
      mailCategory = '2';
    }

    let serviceInsurance = false;
    if (order.OrderServices.findIndex((s) => s.action == 'insurance') > -1) {
      serviceInsurance = true;
      mailCategory = '2';
    }
    
    let serviceCashAssignment = false;
    if (order.OrderServices.findIndex((s) => s.action == 'cash_assigment') > -1) {
      serviceCashAssignment = true;
      mailCategory = '4';
    }

    if(serviceInsurance || serviceCashAssignment && order.declaredValue > 0)
      declaredValue = order.declaredValue;

    //          <pos:AddInfo>${order.externalComment ? this._encodeXMLParam(order.externalComment) : ''}</pos:AddInfo>

    const xml = `<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:pos="http://webservices.kazpost.kz/postratesws">
    <soapenv:Header/>
    <soapenv:Body>
      <pos:GetAddrLetterRequest>
        <pos:Key>${this.apiKey}</pos:Key>
        <pos:AddrInfo>
          <pos:RcpnName>${order.addressDetailsTo.companyName ? this._encodeXMLParam(order.addressDetailsTo.companyName + ',') : '' }  ${this._encodeXMLParam(order.addressDetailsTo.firstName)} ${this._encodeXMLParam(order.addressDetailsTo.lastName)}</pos:RcpnName>
          <pos:RcpnPhone>${this._encodeXMLParam(order.addressDetailsTo.phone)}</pos:RcpnPhone>
          <pos:RcpnEmail>${this._encodeXMLParam(order.addressDetailsTo.email)}</pos:RcpnEmail>
          <pos:RcpnCountry>${this._encodeXMLParam(order.addressDetailsTo.country)}</pos:RcpnCountry>
          <pos:RcpnIndex>${this._encodeXMLParam(order.addressDetailsTo.postCode)}</pos:RcpnIndex>
          <pos:RcpnCity>${this._encodeXMLParam(order.addressDetailsTo.city) + (order.addressDetailsTo.province ? this._encodeXMLParam(', ' + order.addressDetailsTo.province) : '')}</pos:RcpnCity>
          <pos:RcpnStreet>${this._encodeXMLParam(order.addressDetailsTo.addressLine1 + (order.addressDetailsTo.addressLine2 ? (', ' + order.addressDetailsTo.addressLine2) : ''))}</pos:RcpnStreet>
          <pos:RcpnHouse>--</pos:RcpnHouse>
          <pos:SndrBIN>${this.bin}</pos:SndrBIN>
          <pos:SndrName>${order.addressDetailsFrom.companyName ? this._encodeXMLParam(order.addressDetailsFrom.companyName + ',') : ''}  ${this._encodeXMLParam(order.addressDetailsFrom.firstName)} ${this._encodeXMLParam(order.addressDetailsFrom.lastName)}</pos:SndrName>
          <pos:SndrPhone>${this._encodeXMLParam(order.addressDetailsFrom.phone)}</pos:SndrPhone>
          <pos:SndrEmail>${this._encodeXMLParam(order.addressDetailsFrom.email)}</pos:SndrEmail>
          <pos:SndrCountry>${this._encodeXMLParam(order.addressDetailsFrom.country)}</pos:SndrCountry>
          <pos:SndrIndex>${this._encodeXMLParam(order.addressDetailsFrom.postCode)}</pos:SndrIndex>
          <pos:SndrCity>${this._encodeXMLParam(order.addressDetailsFrom.city) + (order.addressDetailsFrom.province ? this._encodeXMLParam(', ' + order.addressDetailsFrom.province) : '')}</pos:SndrCity>
          <pos:SndrStreet>${this._encodeXMLParam(order.addressDetailsFrom.addressLine1 + (order.addressDetailsFrom.addressLine2 ? (', ' + order.addressDetailsFrom.addressLine2) : ''))}</pos:SndrStreet>
          <pos:SndrHouse>--</pos:SndrHouse>
          <pos:Weight>${order.Packages.reduce((a, v) => a + (v.weight * v.quantity), 0)}</pos:Weight>
          <pos:DeclaredValue>${this._encodeXMLParam(declaredValue)}</pos:DeclaredValue>
          <pos:CashOnDelivery>${serviceCashAssignment ? this._encodeXMLParam(declaredValue) : '0'}</pos:CashOnDelivery>
          <pos:ProductCode>${this._encodeXMLParam(serviceCode)}</pos:ProductCode>
          <pos:Marks>
             <pos:Mark>noReturn</pos:Mark>
          </pos:Marks>
          <pos:SendMethod>${this._encodeXMLParam(sendMethod)}</pos:SendMethod>
          <pos:MailCtg>${mailCategory}</pos:MailCtg>
          <pos:OrderNum>${this._encodeXMLParam(order.refNo)}</pos:OrderNum>
          <pos:DEA_NUMBER>${this._encodeXMLParam(this.dea_number)}</pos:DEA_NUMBER>
          <pos:DEA_DEPCODE>${this._encodeXMLParam(this.dea_code)}</pos:DEA_DEPCODE>
       </pos:AddrInfo>
      </pos:GetAddrLetterRequest>
    </soapenv:Body>
  </soapenv:Envelope>`;


    let res = await this._makeRequest(xml);
    res = convert.xml2js(res, { compact: true, ignoreComment: true, spaces: 4 });
	
	console.log('createOrder req: ', xml);
	console.warn('createOrder resp: ', JSON.stringify(res['SOAP-ENV:Envelope']['SOAP-ENV:Body']['ns2:GetAddrLetterResponse']));
	
    return res['SOAP-ENV:Envelope']['SOAP-ENV:Body']['ns2:GetAddrLetterResponse'];
  }
// ***************************************************************************************************************************
// _formatPackages(packages, trackId) {
    
//   return packages.map(p => ({
//     'bar_code': trackId,
//     'width': p.width,
//     'length': p.length,
//     'height': p.height,
//     'weight': p.weight
//   }));
// }


  _formatPerson(address) {

    return( 
      `${address.companyName ? address.companyName + ', ' : ''}${address.firstName} ${address.lastName}` 
    );
  }

  async _getToken() {
    const url = this.test ? 
                'https://kdc-preprod.alabs.space/api/auth/v1/sign-in' :
                'https://go.post.kz/api/auth/v1/sign-in';
    
    const data = {
      "username": this.username,
      "password": this.password
    };

    const opts = {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ this.token }`,
      },
    };

    const res = await fetch(url, opts);
    const ret = await res.json();

    if (![200, 201].includes(res.status)) {
      console.warn('Get token request params: ', url, JSON.stringify(opts));
      console.warn('Get token status: ', res.status);
      console.warn('Get token ret', JSON.stringify(ret));
      // console.warn('Get token raw responce body', JSON.stringify(res.body));

      throw Error('Cannot get the token!');
    }
    
	
    this.requestsLog.push({
      date: new Date(),
      req: {
        url,
        body: JSON.stringify(data),
      },
      res: ret,
    });
	
    return ret.token;
  }

  _sleep = (ms) => new Promise(r => setTimeout(r, ms));

  async _createCourierRequest(order) {
    
    const url =  this.test ? 
                  'https://kdc-preprod.alabs.space/api/core/v1/call-courier' :
                  'https://go.post.kz/api/core/v1/call-courier';

    const isToday = moment().format('DD.MM.YYYY') == moment(order.pickupTime).format('DD.MM.YYYY');
    const sameDayPickup = isToday && moment(order.pickupTime).hours() < 17;

    const pickupDate = sameDayPickup ? moment(order.pickupTime) :  moment(order.pickupTime).add(1, 'day');
    const prefix = 'BS_';
    const packages = order.Packages ? order.Packages : order.packages;
    const address = order.addressDetailsFrom;
    const region = {
      'Актобе': {
        'code': 'AKX',
        'branch': '039942'
      },
      'Талдыкорган': {
        'code': 'TLD',
        'branch': '049924'
      },
      'Атырау': {
        'code': 'GUW',
        'branch': '069957'
      },
      'Семей': {
        'code': 'PLX',
        'branch': '071252'
      },
      'Тараз': {
        'code': 'DMB',
        'branch': '089961'
      },
      'Уральск': {
        'code': 'URA',
        'branch': '099938'
      },
      'Караганды': {
        'code': 'KGF',
        'branch': '109961'
      },
      'Костанай': {
        'code': 'KST',
        'branch': '119930'
      },
      'Кызылорда': {
        'code': 'KZO',
        'branch': '129950'
      },
      'Актау': {
        'code': 'SCO',
        'branch': '139955'
      },
      'Павлодар': {
        'code': 'PWQ',
        'branch': '149948'
      },
      'Петропавловск': {
        'code': 'PPK',
        'branch': '159930'
      },
      'Туркестан': {
        'code': 'YUZ',
        'branch': '161352'
      },
      'Шымкент': {
        'code': 'CIT',
        'branch': '369970'
      },
      'Алматы': {
        'code': 'ALA',
        'branch': '059900/508'
      },
      'Нур-Султан': {
        'code': 'NQZ',
        'branch': '019900/92'
      },
      'Астана': {
        'code': 'NQZ',
        'branch': '019900/92'
      },
      'Кокшетау': {
        'code': 'KOV',
        'branch': '329914'
      },
      'Усть-Каменогорск': {
        'code': 'PLX',
        'branch': '079936'
      },
    }

    const data = {
      'delivery_item_code': prefix + 'CC',
      'order_number': prefix + order.refNo,
      'item_count': packages.length,
      'contract_number':this.dea_code, // contract
      'product_type': order.PackageType.type == 'box' ? 'GOOD' : 'DOC',
      'courier_arrived_date': pickupDate.format('DD.MM.YYYY'),
      'idn': this.bin,
      'no_blank': false,
      'customers': [{
        'name': this._formatPerson(address),
        'phone_number': address.phone,
        'relation_type':'SENDER'
      }],
      'address_from': {
        'region_code': region[address.city].code,
        'address': address.addressLine1 + (address.addressLine2 ? (', ' + address.addressLine2) : ''),
        // 'postal_code': order.addressDetailsFrom.postCode, // not required
        'comment': order.externalComment
      },
      'branch_code': this.test ? '059900/01' : region[address.city].branch,//local postoffice
      'total_weight': packages.reduce((a, v) => a + (v.weight * v.quantity), 0),
      // 'items': this._formatPackages(packages, order.tracking) // not required
    };
    // console.log('Courier req data: ', data);


    if (this.token == null) {
      const token = await this._getToken();
      if (!token) throw Error('Cannot get token');
      this.token = token;
      this.tokenRequests = 0;
    }

    const opts = {
      method: 'POST',
      body: JSON.stringify(data),
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ this.token }`,
      },
    };

    const res = await fetch(url, opts);



    const ret = await res.json();
    // console.warn('Courier request params: ', url, JSON.stringify(opts));
    // console.log('Courier responce: ', ret);

    this.requestsLog.push({
      date: new Date(),
      req: {
        url,
        body: JSON.stringify(data),
      },
      res: ret,
    });


    switch(res.status) {
      case 400:
        if (ret.message && ret.message.includes('Заявка с таким номером уже существует')) {
          console.warn('Courier request already exists!');
          return null;
        }

        throw Error(JSON.stringify(ret.message));

      case 401:
        this.tokenRequests++;
        console.log('Trying to get a new token, attempt #' + this.tokenRequests);
        if (this.tokenRequests > 3) throw Error('Cannot renew token');
        await this._sleep(5000);
        this._createCourierRequest(order);
        break;

      case 201:
        return ret;

      default:
        console.warn('_isOk? ', res.ok);
        console.warn('Create CourierRequest request params: ', url, JSON.stringify(opts));
        console.warn('Create CourierRequest status: ', res.status);
        // console.warn('Create CourierRequest ret', JSON.stringify(ret));
        console.warn('Create CourierRequest raw responce body', JSON.stringify(res.body));
        
        throw Error(JSON.stringify(ret));
    }
  };
}

module.exports = EmsAPI;
