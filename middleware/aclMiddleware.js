const asyncHandler = require('express-async-handler');
const createError = require('http-errors');
const acl = require('../acl');
const md5 = require('md5');
const models = require('../models');
const config = require('../config/app.js');

function getHashedIP(str) {
  if (!str) return '';

  const [ip, ipHash] = str.split('|');
  const hash = md5(config.ipHashKey + '|' + ip);

   if (hash !== ipHash) return '';
  return ip;
}


const aclMiddleware = (perm) => {
  return asyncHandler(async (req, res, next) => {
    //console.log(req.originalUrl, req.query, req.body);
    //console.log(req.headers['x-ssr-real-ip']);

    const userId = req.user ? req.user.id : null;
    const role = req.user ? req.user.role : 'guest';
    const ip = getHashedIP(req.headers['x-ssr-real-ip']) || req.ip;
    const hash = md5(ip + '|' + req.useragent.source);
    const data = {
      url:      req.originalUrl,
      method:   req.method,
      query:    req.query,
      body:     req.body,
      headers:  req.headers,
      referrer: req.get('Referrer'),
    };

    await models.AccessLog.create({
      UserId: userId,
      role,
      perm,
      ip,
      useragent: req.useragent.source,
      hash,
      data,
    });

    if (!req.user) {
      if (!acl.isAllowed('guest', perm)) return next(createError(401, 'Unauthorized'));
    } else {
      if (!req.user.isActive && !acl.isAllowed('guest', perm)) next(createError(401, 'User Not Active'))
      if (!acl.isAllowed(req.user.role, perm)) return next(createError(403, 'Forbidden'));
    }

    next();
  });
}

module.exports = aclMiddleware;
