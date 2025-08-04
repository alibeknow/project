const { Order, Sequelize, sequelize } = require('../models');

const config = require('../config/app');

const moment = require('moment-timezone');
moment.tz.setDefault(config.timezone);


function msleep(n) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, n);
}
function sleep(n) {
  msleep(n*1000);
}


const doOrderStatusUpdate = async () => {
  console.log('Status daemon: doOrderStatusUpdate()');

  const orders = await Order.findAll({
    where: {
      orderStatus: 'pending',
      createdAt: {
        [Sequelize.Op.lt]: moment().subtract(config.statusDaemon.cancelPendingDays || 7, 'days').toDate(),
      }
    },
    order: [['id', 'ASC']],
    attributes: {
      exclude: ['attachments'],
    },
  });

  for (let order of orders) {
    console.log('doOrderStatusUpdate(): Canceling pending order, ID=' + order.id);

    order.orderStatus = 'canceled';
    order.updatedById = 1;
    await order.save();
  }
};


const run = async () => {
  if (!config.statusDaemon.active) return;

  console.log('Status daemon: run()');

  const doOrderStatusUpdateCall = () => {
    setTimeout((async () => {
      try {
        await doOrderStatusUpdate();
      } catch (e) {
        console.error(e);
      }
      doOrderStatusUpdateCall();
    }), config.statusDaemon.doOrderStatusUpdateTimeout || 60000);
  }
  doOrderStatusUpdateCall();
}

module.exports.run = run;
