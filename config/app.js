'use strict';

/**
 * Application configuration.
 * All sensitive values are read from environment variables.
 * In test environment (NODE_ENV=test) uses jsonTransport for mailer
 * so emails are captured without actually being sent.
 */

const env = process.env.NODE_ENV || 'development';

module.exports = {
  secret_key:  process.env.APP_SECRET_KEY  || 'dev-secret-key-change-in-production',
  ipHashKey:   process.env.APP_IP_HASH_KEY || 'dev-ip-hash-key',
  timezone:    process.env.APP_TIMEZONE    || 'Asia/Almaty',
  type:        process.env.APP_TYPE        || 'bestsender',
  req_size_limit: process.env.APP_REQ_SIZE_LIMIT || '50mb',
  robotEmailFrom: process.env.APP_ROBOT_EMAIL    || 'robot@bestsender.kz',

  emailSubjects: {
    forgotPassword:      process.env.EMAIL_SUBJECT_FORGOT   || 'Восстановление пароля',
    newUserNotification: process.env.EMAIL_SUBJECT_NEW_USER || 'Новый пользователь',
  },

  // In test mode: nodemailer's built-in jsonTransport captures emails as JSON, no SMTP needed.
  // In production/development: read SMTP settings from env vars.
  mailer: env === 'test'
    ? { jsonTransport: true }
    : {
        host:   process.env.SMTP_HOST   || 'localhost',
        port:   parseInt(process.env.SMTP_PORT   || '25', 10),
        secure: process.env.SMTP_SECURE === 'true',
        auth:   process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' }
          : undefined,
      },

  cloudpayments: {
    privateKey: process.env.CLOUDPAYMENTS_PRIVATE_KEY || '',
    publicId:   process.env.CLOUDPAYMENTS_PUBLIC_ID   || '',
  },

  apiDaemon: {
    doOrderPlaceTimeout: parseInt(process.env.API_DAEMON_PLACE_TIMEOUT || '60000', 10),
    doOrderTrackTimeout: parseInt(process.env.API_DAEMON_TRACK_TIMEOUT || '60000', 10),
  },

  statusDaemon: {
    active:                     process.env.STATUS_DAEMON_ACTIVE === 'true',
    cancelPendingDays:          parseInt(process.env.STATUS_DAEMON_CANCEL_DAYS || '7',     10),
    doOrderStatusUpdateTimeout: parseInt(process.env.STATUS_DAEMON_TIMEOUT    || '60000', 10),
  },

  logsDaemon: {
    active:                    process.env.LOGS_DAEMON_ACTIVE === 'true',
    deleteAccessLogsDays:      parseInt(process.env.LOGS_DAEMON_DAYS    || '30',    10),
    doAccessLogCleanupTimeout: parseInt(process.env.LOGS_DAEMON_TIMEOUT || '60000', 10),
  },
};
