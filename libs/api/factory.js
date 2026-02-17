const config = require('../../config/app');

const AlemTatAPI = require('./alemtat');
const MeaSoftAPI = require('./measoft');
const CseAPI = require('./cse');
const GpsAPI = require('./gps');
const AramexAPI = require('./aramex');
const PonyExpressAPI = require('./ponyexpress');
const AseAPI = require('./ase');
const SparkAPI = require('./spark');
const EmsAPI = require('./ems');
const DpdAPI = require('./dpd');
const YandexAPI = require ('./yandex');
const SdekAPI = require ('./sdek');
const TatexAPI = require ('./tatex');
const SmartDeliveryAPI = require ('./smartdelivery');
const RocketDeliveryAPI = require ('./rocketdelivery');

function createAPI(api='ase') {

  switch (api) {
    case 'alemtat': 
      return new AlemTatAPI({
        apiKey: config.alemtat.apiKey,
        card: config.alemtat.card,
        senderName: config.alemtat.senderName,
        test: config.alemtat.test,
      });
    case 'measoft': 
      return new MeaSoftAPI({
        login: config.measoft.login,
        password: config.measoft.password,
        extracode: config.measoft.extracode
      });
    case 'cse':
      return new CseAPI({ 
        login: config.cse.login, 
        password: config.cse.password, 
        test: config.cse.test 
      });
    case 'cse_msk_mo':
      return new CseAPI({ 
        login: config.cse_msk_mo.login, 
        password: config.cse_msk_mo.password, 
        test: config.cse_msk_mo.test 
      });
    case 'cse_im':
      return new CseAPI({ 
        login: config.cse_im.login, 
        password: config.cse_im.password, 
        test: config.cse_im.test 
      });
    case 'cse_cargo':
      return new CseAPI({ 
        login: config.cse_cargo.login, 
        password: config.cse_cargo.password, 
        test: config.cse_cargo.test 
      });
    case 'cse_business':
      return new CseAPI({ 
        login: config.cse_business.login, 
        password: config.cse_business.password, 
        test: config.cse_business.test 
      });
    case 'gps':
      return new GpsAPI({
        auth_token: config.gps.auth_token,
        user_id: config.gps.user_id,
        organization_id: config.gps.organization_id,
      });
    case 'aramex':
      return new AramexAPI({
        clientInfo: config.aramex.clientInfo,
        test: config.aramex.test,
      });
    case 'ponyexpress':
      return new PonyExpressAPI({
        accessKey: config.ponyexpress.accessKey,
      });
    case 'ase':
      return new AseAPI({
        authorizationCode: config.ase.authorizationCode,
        password: config.ase.password, 
      });
    case 'spark':
      return new SparkAPI({
        user: config.spark.user,
        password: config.spark.password, 
        token: config.spark.token,
        test: config.spark.test,
      });
    case 'ems':
      return new EmsAPI({
        apiKey: config.ems.apiKey,
        dea_number: config.ems.dea_number,
        dea_code: config.ems.dea_code,
        bin: config.ems.bin,
        test: config.ems.test,
      });
    case 'dpd':
      return new DpdAPI({
        userNum: config.dpd.userNum,
        apiKey: config.dpd.apiKey,
        test: config.dpd.test,
      });
    case 'yandex':
      return new YandexAPI({
        userNum: config.yandex.token,
      });
    case 'sdek':
      return new SdekAPI({
        account: config.sdek.user,
        password: config.sdek.passsword,
      });
    case 'tatex':
      return new TatexAPI({
        apiKey: config.tatex.apiKey,
      });
    case 'smartdelivery':
      return new SmartDeliveryAPI({
        login: config.smartdelivery.login,
        password: config.smartdelivery.password,
        salt: config.smartdelivery.salt,
        clientID: config.smartdelivery.clientID,
        instance: config.dreamdelivery.instance,
      });
    case 'dreamdelivery':
      return new SmartDeliveryAPI({
        login: config.dreamdelivery.login,
        password: config.dreamdelivery.password,
        salt: config.dreamdelivery.salt,
        clientID: config.dreamdelivery.clientID,
        instance: config.dreamdelivery.instance,
      });
    case 'rocketdelivery':
      return new RocketDeliveryAPI({
        yaToken: config.rocketdelivery.yaToken,
        jwt: config.rocketdelivery.jwt,
        refreshToken: config.rocketdelivery.refreshToken,
      });
  }

}

module.exports = createAPI;
