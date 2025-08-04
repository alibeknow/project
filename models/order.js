const config = require('../config/app.js');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

const mailerLib = require('../libs/mailer');
const dataUriToBuffer = require('data-uri-to-buffer');
const Expo = require('expo-server-sdk').Expo;

function trim(str, chars) {
  return str.split(chars).filter(Boolean).join(chars);
}

function trimStart(str, chars) {
  return str.split(chars).filter((n, idx) => idx == 0 ? n : true).join(chars);
}


module.exports = (sequelize, DataTypes) => {
  const Order = sequelize.define('Order', {
    refNo: { type: DataTypes.STRING },
    tracking: DataTypes.STRING,
    orderStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isProperValue(value) {
          if (
            value != 'pending' &&
            value != 'processing' &&
            value != 'attention' &&
            value != 'confirmed' &&
            value != 'declined' &&
            value != 'returned' &&
            value != 'destroyed' &&
            value != 'lost' &&
            value != 'canceled' &&
            value != 'in_transit' &&
            value != 'idle_run' &&
            value != 'delivered'
          ) {
            throw new Error('Only "pending", "processing", "attention", "confirmed", "declined", "returned", "destroyed", "lost", "canceled", "in_transit", "idle_run", "delivered" values are allowed!');
          }
        }
      }
    },
    orderStatusMeta: DataTypes.JSON,
    orderStatusDescription: DataTypes.STRING,
    paymentStatus: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        isProperValue(value) {
          if (
            value != 'pending' &&
            value != 'authorized' &&
            value != 'confirmed' &&
            value != 'failed' &&
            value != 'refunded' &&
            value != 'canceled' &&
            value != 'contract'
          ) {
            throw new Error('Only "pending", "authorized", "confirmed", "failed", "refunded", "canceled", "contract" values are allowed!');
          }
        }
      }
    },
    paymentStatusMeta: DataTypes.JSON,
    paymentStatusDescription: DataTypes.STRING,
    paymentType: {
      type: DataTypes.STRING, // cloudpayments, bankwire, monthlyinvoice
      allowNull: false,
      validate: {
        isProperValue(value) {
          if (
            value != 'cloudpayments' &&
            value != 'bankwire' &&
            value != 'monthlyinvoice'
          ) {
            throw new Error('Only "cloudpayments", "bankwire", "monthlyinvoice" values are allowed!');
          }
        }
      }
    },
    countryCodeFrom: { type: DataTypes.STRING },
    countryCodeTo: { type: DataTypes.STRING },
    addressFrom: DataTypes.TEXT,
    addressTo: DataTypes.TEXT,
    addressDetailsFrom: DataTypes.JSON,
    addressDetailsTo: DataTypes.JSON,
    attachments: DataTypes.JSON,
    externalComment: DataTypes.TEXT,
    internalComment: DataTypes.TEXT,
    contents: DataTypes.STRING,
    declaredValue: DataTypes.FLOAT,
    pickupTime: DataTypes.DATE,
    percentVAT: DataTypes.FLOAT,
    clientDiscount: DataTypes.FLOAT,
    companyPrice: DataTypes.FLOAT,
    clientPrice: DataTypes.FLOAT,
    fuelTax: DataTypes.FLOAT,
    insurance: DataTypes.FLOAT,
    taxVAT: DataTypes.FLOAT,
    totalPrice: DataTypes.FLOAT,
    langCode: { type: DataTypes.STRING, defaultValue: 'en' },
    meta: DataTypes.JSON,
  });

  const orderRefNoHook = models => async (order, options) => {
    const stringMod10 = (str) => {
      let sum = 0;
      for (let c of str) {
        let num = parseInt(c, 10);
        if (Number.isInteger(num)) {
          sum += num;
        }
      }
      return sum % 10;
    }

    const today = moment().format('YYMMDD');
    const id = order.id.toString().padStart(5, '0');
    const refNo = today + '-' + id;
    const refNoWithChecksum = refNo + stringMod10(refNo);

    await models.Order.update({
      refNo: refNoWithChecksum,
    }, {
      where: { id: order.id },
      transaction: options.transaction,
    });
  }

  const orderStatusHook = models => async (order, options) => {
    if (order.changed('orderStatus')) {
      await models.OrderStatusHistory.create({
        OrderId: order.id,
        orderStatus: order.orderStatus,
      });

      let pushTokens = await models.PushToken.findAll({
        where: {
          UserId: order.UserId,
        },
      });

      if (
        pushTokens &&
        pushTokens.length > 0 &&
        ['pending', 'confirmed', 'declined'].includes(order.orderStatus) === false
      ) {
        pushTokens = pushTokens.map((pushToken) => pushToken.pushToken);
        const pushMsg = order.langCode == 'ru' ? `Статус заказа №${order.refNo} изменился!` : `Order status #${order.refNo} changed!`;

        // expo push
        let expo = new Expo();

        let messages = [];
        for (let pushToken of pushTokens) {
          if (!Expo.isExpoPushToken(pushToken)) {
            console.error(`Push token ${pushToken} is not a valid Expo push token`);
            continue;
          }
          // Construct a message (see https://docs.expo.io/push-notifications/sending-notifications/)
          messages.push({
            to: pushToken,
            sound: 'default',
            body: pushMsg,
            data: {
              url: '/order/' + order.id,
              orderId: order.id,
            },
          });
        }
        let chunks = expo.chunkPushNotifications(messages);
        let tickets = [];
        (async () => {
          for (let chunk of chunks) {
            try {
              let ticketChunk = await expo.sendPushNotificationsAsync(chunk);
              console.log(ticketChunk);
              tickets.push(...ticketChunk);
              // NOTE: If a ticket contains an error code in ticket.details.error, you
              // must handle it appropriately. The error codes are listed in the Expo
              // documentation:
              // https://docs.expo.io/push-notifications/sending-notifications/#individual-errors
            } catch (error) {
              console.error(error);
            }
          }
        })();
      }

      // order confirmed
      if (order.orderStatus == 'confirmed') {
        try {
          const configParams = await models.ConfigParam.findAll({
            where: {},
          });
          const _config = {};

          configParams.forEach((configParam) => {
            _config[configParam.param] = configParam.value;
          });

          const user = await models.User.findOne({
            where: { id: order.UserId },
          });

          const attachments = [];
          if (Array.isArray(order.attachments)) {
            for (let attachment of order.attachments) {
              attachments.push({
                filename: attachment.name,
                content: dataUriToBuffer(attachment.data),
              });
            }
          }

          await mailerLib.sendFromTemplate({
            message: {
              from: config.robotEmailFrom,
              to: user.email,
              subject: config.emailSubjects.orderConfirmation,
              attachments,
            },
            template: 'order_confirmation',
            data: {
              order: order.toJSON(),
              user: user.toJSON(),
              config: _config,
            },
          });
        } catch (error) {
          console.error(error);
        }
      }
    }
    if (order.changed('paymentStatus')) {
      await models.OrderPaymentStatusHistory.create({
        OrderId: order.id,
        paymentStatus: order.paymentStatus,
        transaction: options.transaction,
      });
    }
  }

  const orderCountryHook = models => async (order, options) => {
    if (order.changed('CountryFromId')) {
      const lang = order.langCode;
      const country = await models.Country.findByPk(order.CountryFromId);
      const countryCode = country ? country.code : '';
      order.countryCodeFrom = countryCode;
    }
    if (order.changed('CountryToId')) {
      const lang = order.langCode;
      const country = await models.Country.findByPk(order.CountryToId);
      const countryCode = country ? country.code : '';
      order.countryCodeTo = countryCode;
    }
  }

  const orderAddressHook = models => async (order, options) => {
    if (order.changed('addressDetailsFrom')) {
      const lang = order.langCode;
      const address = order.addressDetailsFrom;
      const country = await models.Country.findByPk(address.CountryId);
      const countryName = country ? country.name[lang] : '';
      const countryCode = country ? country.code : '';
      order.addressDetailsFrom.country = countryName;
      order.addressDetailsFrom.countryCode = countryCode;

      address.city = trimStart(address.city, 'г.');
      // address.province = (address.province == '' ? address.province : address.province.trim());

      let accumulatedAddress = '';

      if (address.postCode) accumulatedAddress+= address.postCode + ' ';
      if (countryName) accumulatedAddress+= countryName + ', ';
      if (address.province) accumulatedAddress+= address.province + ', ';
      if (address.city) accumulatedAddress+= address.city + ', ';
      if (address.addressLine1) accumulatedAddress+= address.addressLine1 + (!address.addressLine2 ? ' / ': ' ');
      if (address.addressLine2) accumulatedAddress+= address.addressLine2 + (!address.addressLine1 ? ' / ': ' ');
      if (address.firstName) accumulatedAddress+= address.firstName + (!address.lastName ? ' / ': ' ');
      if (address.lastName) accumulatedAddress+= address.lastName + ' / ';
      if (address.companyName) accumulatedAddress+= address.companyName + ' / ';
      if (address.phone) accumulatedAddress+= address.phone + ' / ';
      if (address.email) accumulatedAddress+= address.email + ' ';

      order.addressFrom = trim(accumulatedAddress, ' / ');
    }
    if (order.changed('addressDetailsTo')) {
      const lang = order.langCode;
      const address = order.addressDetailsTo;
      const country = await models.Country.findByPk(address.CountryId);
      const countryName = country ? country.name[lang] : '';
      const countryCode = country ? country.code : '';
      order.addressDetailsTo.country = countryName;
      order.addressDetailsTo.countryCode = countryCode;

      address.city = trimStart(address.city, 'г.').trim();
      address.province = address.province.trim();

      let accumulatedAddress = '';

      if (address.postCode) accumulatedAddress+= address.postCode + ' ';
      if (countryName) accumulatedAddress+= countryName + ', ';
      if (address.province) accumulatedAddress+= address.province + ', ';
      if (address.city) accumulatedAddress+= address.city + ', ';
      if (address.addressLine1) accumulatedAddress+= address.addressLine1 + (!address.addressLine2 ? ' / ': ' ');
      if (address.addressLine2) accumulatedAddress+= address.addressLine2 + (!address.addressLine1 ? ' / ': ' ');
      if (address.firstName) accumulatedAddress+= address.firstName + (!address.lastName ? ' / ': ' ');
      if (address.lastName) accumulatedAddress+= address.lastName + ' / ';
      if (address.companyName) accumulatedAddress+= address.companyName + ' / ';
      if (address.phone) accumulatedAddress+= address.phone + ' / ';
      if (address.email) accumulatedAddress+= address.email + ' ';

      order.addressTo = trim(accumulatedAddress, ' / ');
    }
  }

  const orderHistoryHook = (models, action) => async (order, options) => {
    const orderData = await models.Order.findOne({
      where: { id: order.id },
      include: [
        models.Package,
        models.OrderService
      ],
      attributes: {
        exclude: [ 'attachments' ],
      },
      transaction: options.transaction,
    });

    await models.OrderHistory.create({
      action,
      orderData,
      OrderId: orderData.id,
      transaction: options.transaction,
    });
  }

  const orderNormalizeHook = models => async (order, options) => {
    for (let field in order.dataValues) {
      if (typeof order[field] == 'string') {
        order[field] = order[field].trim();
      }
    }

    for (let field in order.dataValues.addressDetailsFrom) {
      if (typeof order.addressDetailsFrom[field] == 'string') {
        order.addressDetailsFrom[field] = order.addressDetailsFrom[field].trim();
      }
    }
    for (let field in order.dataValues.addressDetailsTo) {
      if (typeof order.addressDetailsTo[field] == 'string') {
        order.addressDetailsTo[field] = order.addressDetailsTo[field].trim();
      }
    }
  }

  Order.associate = function(models) {
    models.Order.addHook('beforeCreate', orderNormalizeHook(models));
    models.Order.addHook('beforeUpdate', orderNormalizeHook(models));
    
    models.Order.addHook('beforeCreate', orderCountryHook(models));
    models.Order.addHook('beforeUpdate', orderCountryHook(models));

    models.Order.addHook('beforeCreate', orderAddressHook(models));
    models.Order.addHook('beforeUpdate', orderAddressHook(models));

    models.Order.addHook('afterCreate', orderRefNoHook(models));

    models.Order.addHook('afterCreate', orderStatusHook(models));
    models.Order.addHook('afterUpdate', orderStatusHook(models));

    models.Order.addHook('beforeUpdate', orderHistoryHook(models, 'update'));
    models.Order.addHook('beforeDestroy', orderHistoryHook(models, 'destroy'));

    models.Order.belongsTo(models.User, {
      as: 'createdBy',
    });
    models.Order.belongsTo(models.User, {
      as: 'updatedBy',
    });

    models.Order.belongsTo(models.User, {
      as: 'User',
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    });
    models.Order.belongsTo(models.PackageType, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    });
    models.Order.belongsTo(models.RateType, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    });
    models.Order.hasMany(models.Package, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    models.Order.hasMany(models.OrderService, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    models.Order.hasMany(models.OrderStatusHistory, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
    models.Order.hasMany(models.OrderPaymentStatusHistory, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });

    models.Order.belongsTo(models.Address, {
      as: 'AddressFrom',
    });
    models.Order.belongsTo(models.Address, {
      as: 'AddressTo',
    });
    models.Order.belongsTo(models.Country, {
      as: 'CountryFrom',
    });
    models.Order.belongsTo(models.Country, {
      as: 'CountryTo',
    });
    models.Order.belongsTo(models.Region, {
      as: 'RegionFrom',
    });
    models.Order.belongsTo(models.Region, {
      as: 'RegionTo',
    });
    models.Order.belongsTo(models.Carrier, {
      foreignKey: {
        allowNull: false,
      },
      onDelete: 'RESTRICT',
      onUpdate: 'RESTRICT',
    });
    models.Order.belongsTo(models.Rate);
    
    models.Order.belongsToMany(models.Tag, {
      //as: 'Tags',
      through: models.OrderTag,
      onDelete: 'CASCADE',
      onUpdate: 'CASCADE',
    });
  };

  return Order;
};
