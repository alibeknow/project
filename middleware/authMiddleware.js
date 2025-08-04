const asyncHandler = require('express-async-handler');
const createError = require('http-errors');
const models = require('../models');
const cookieSignature = require('cookie-signature');
const config = require('../config/app');

const authMiddleware = asyncHandler(async (req, res, next) => {
  const api_key = req.headers['x-api-key'];
  //console.log('api_key:', api_key);

  let user = null;

  if (api_key) {
    user = await models.User.findOne({
      where: {
        APIKey: api_key,
        isAPIActive: true,
      },
      include: [
        {
          model: models.Group,
          include: [
            {
              model: models.GroupDiscount,
              include: [
                {
                  model: models.Zone,
                  as: 'Zones',
                }
              ],
            },
          ],
        },
      ],
    });
  } else if ((
    req.signedCookies.token !== undefined && req.signedCookies.token !== false) ||
    req.headers['x-auth-token'] !== undefined ||
    req.query['auth-token'] !== undefined 
  ) {
    let userId;
    const cookieToken = req.signedCookies.token !== undefined && req.signedCookies.token;
    const authToken   = (req.headers['x-auth-token'] !== undefined && cookieSignature.unsign(req.headers['x-auth-token'], config.secret_key)) ||
      (req.query['auth-token'] !== undefined && cookieSignature.unsign(req.query['auth-token'], config.secret_key));

    if (cookieToken) {
      userId = cookieToken;
    }
    if (authToken) {
      userId = authToken;
    }

    if (userId) {
      user = await models.User.findOne({
        where: {
          id: userId,
        },
        include: [
          {
            model: models.Group,
            include: [
              {
                model: models.GroupDiscount,
                include: [
                  {
                    model: models.Zone,
                    as: 'Zones',
                  }
                ],
              },
            ],
          },
        ],
      });
    }
  }

  if (user) {
    user.lastActive = new Date();
    user.lastIP = req.ip;
    req.user = await user.save();
  }
  next();
});

module.exports = authMiddleware;
