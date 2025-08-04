const { AccessLog, Sequelize, sequelize } = require('../models');

const config = require('../config/app');

const moment = require('moment-timezone');
moment.tz.setDefault(config.timezone);


function msleep(n) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
}
function sleep(n) {
  msleep(n*1000);
}


const doAccessLogCleanup = async () => {
  console.log('Logs daemon: doAccessLogCleanup()');

  const orders = await AccessLog.destroy({
    where: {
      createdAt: {
        [Sequelize.Op.lt]: moment().subtract(config.logsDaemon.deleteAccessLogsDays || 30, 'days').toDate(),
      }
    },
  });
};


const run = async () => {
  if (!config.logsDaemon.active) return;

  console.log('Logs daemon: run()');

  const doAccessLogCleanupCall = () => {
    setTimeout((async () => {
      try {
        await doAccessLogCleanup();
      } catch (e) {
        console.error(e);
      }
      doAccessLogCleanupCall();
    }), config.logsDaemon.doAccessLogCleanupTimeout || 60000);
  }
  doAccessLogCleanupCall();
}

module.exports.run = run;
