const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const bcrypt = require('bcrypt');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');
const acl = require('../acl');

const { User, Company, UserGroup, Group, PushToken, Sequelize, sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');

const usersLib = require('../libs/users');
const mailerLib = require('../libs/mailer');
const configLib = require('../libs/config');

const config = require('../config/app');
const moment = require('moment-timezone');

moment.tz.setDefault(config.timezone);

const hb = require('handlebars');

const fs = require('fs');
const util = require('util');
const path = require('path');
const fsWriteAsync = util.promisify(fs.write);
const fsReadFileAsync = util.promisify(fs.readFile);

const cookieSignature = require('cookie-signature');


router.get('/', authMiddleware, aclMiddleware('users:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('User', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  let primaryCompanyId = null;
  const primaryCompany = await Company.findOne({
    where: { isPrimary: true },
  });
  if (!primaryCompany) throw Error('Primary Company is not defined.');
  primaryCompanyId = primaryCompany.id;

  let userCompanyId = req.user.CompanyId;

  if (userCompanyId != primaryCompanyId) {
    if (!conditions.where.User) conditions.where.User = {};
    conditions.where.User.CompanyId = userCompanyId;
  }

  let userInclude = []; // still has wrong count if more than one group selected
  if (conditions.where.Group && Object.keys(conditions.where.Group).length > 0) {
    userInclude.push({
      model: Group,
      where: conditions.where.Group,
    });
  }

  const count = await User.count({
    where: conditions.where.User,
    include: [
      {
        model: Company,
        where: conditions.where.Company,
      },
      ...userInclude,
    ]
  });

  const rows = await User.findAll({
    where: conditions.where.User,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
    attributes: {
      exclude: ['password', 'APIKey'],
    },
    include: [
      {
        model: Company,
        where: conditions.where.Company,
      },
      {
        model: Group,
        where: conditions.where.Group,
      },
    ]
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/get', authMiddleware, aclMiddleware('users:get'), asyncHandler(async (req, res, next) => {
  if (acl.isAllowed(req.user.role, 'users:perms-all')) {
    var id = req.query.id;
    if (!id) id = req.user.id;
  } else {
    var id = req.user.id;
  }

  let primaryCompanyId = null;
  const primaryCompany = await Company.findOne({
    where: { isPrimary: true },
  });
  if (!primaryCompany) throw Error('Primary Company is not defined.');
  primaryCompanyId = primaryCompany.id;

  let userCompanyId = req.user.CompanyId;

  let whereUser = { id };
  if (userCompanyId != primaryCompanyId) {
    whereUser.CompanyId = userCompanyId;
  }

  const obj = await User.findOne({
    where: whereUser,
    attributes: {
      exclude: ['password'],
    },
    include: [
      {
        model: Company,
      },
      {
        model: Group,
      },
    ],
  });
  res.json(createJSONResult(obj));
}));

router.post('/add', authMiddleware, aclMiddleware('users:add'), asyncHandler(async (req, res, next) => {
  if (req.body.role) {
    if (!acl.rolesSubordinaries[req.user.role].find((r) => r == req.body.role)) throw Error('Unable to elevate role privileges!');
  }

  let primaryCompanyId = null;
  const primaryCompany = await Company.findOne({
    where: { isPrimary: true },
  });
  if (!primaryCompany) throw Error('Primary Company is not defined.');
  primaryCompanyId = primaryCompany.id;

  let userCompanyId = req.user.CompanyId;

  if (userCompanyId != primaryCompanyId) {
    if (req.body.CompanyId) {
      if (req.body.CompanyId != userCompanyId) throw Error('Unable to create user in a different company!');
    }
  }

  const result = await sequelize.transaction(async (t) => {
    const obj = await User.create({
      ...req.body,
      createdById: req.user.id,
      updatedById: req.user.id,
    });

    await UserGroup.destroy({
      where: { UserId: obj.id }
    });

    const groupsArr = req.body.groups || [];
    for (let group of groupsArr) {
      await UserGroup.create({
        UserId: obj.id,
        GroupId: group,
      });
    }

    return obj;
  });
  res.json(createJSONResult(result));
}));

router.post('/edit', authMiddleware, aclMiddleware('users:edit'), asyncHandler(async (req, res, next) => {
  if (acl.isAllowed(req.user.role, 'users:perms-all')) {
    var id = req.body.id;
  } else {
    var id = req.user.id;
  }

  let primaryCompanyId = null;
  const primaryCompany = await Company.findOne({
    where: { isPrimary: true },
  });
  if (!primaryCompany) throw Error('Primary Company is not defined.');
  primaryCompanyId = primaryCompany.id;

  let userCompanyId = req.user.CompanyId;

  let whereUser = { id };
  if (userCompanyId != primaryCompanyId) {
    whereUser.CompanyId = userCompanyId;
    if (req.body.CompanyId) {
      if (req.body.CompanyId != userCompanyId) throw Error('Unable to create user in a different company!');
    }
  }

  if (req.body.role) {
    if (!acl.rolesSubordinaries[req.user.role].find((r) => r == req.body.role)) throw Error('Unable to elevate role privileges!');
  }

  const result = await sequelize.transaction(async (t) => {
    const obj = await User.findOne({
      where: whereUser
    });

    if (obj.role) {
      if (!acl.rolesSubordinaries[req.user.role].find((r) => r == obj.role)) throw Error('Unable to edit a user with higher privileges!');
    }

    for (let field in req.body) {
      obj[field] = req.body[field];
    }
    obj.updatedById = req.user.id;
    const _result = await obj.save();

    if (typeof req.body.groups != 'undefined') {
      await UserGroup.destroy({
        where: { UserId: obj.id }
      });

      const groupsArr = req.body.groups || [];
      for (let group of groupsArr) {
        await UserGroup.create({
          UserId: obj.id,
          GroupId: group,
        });
      }
    }

    return _result;
  });
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('users:delete'), asyncHandler(async (req, res, next) => {
  if (acl.isAllowed(req.user.role, 'users:perms-all')) {
    var id = req.body.id;
  } else {
    var id = req.user.id;
  }

  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }

  let primaryCompanyId = null;
  const primaryCompany = await Company.findOne({
    where: { isPrimary: true },
  });
  if (!primaryCompany) throw Error('Primary Company is not defined.');
  primaryCompanyId = primaryCompany.id;

  let userCompanyId = req.user.CompanyId;

  if (userCompanyId != primaryCompanyId) {
    where.CompanyId = userCompanyId;
  }

  const obj = await User.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

router.post('/login', authMiddleware, aclMiddleware('users:login'), asyncHandler(async (req, res, next) => {
  const { email, password, authToken } = req.body;
  let token = null;
  let uid = null;

  const user = await User.findOne({
    where: {
      email: email.toLowerCase(),
    },
  });

  if (user) {
    if (!user.isActive) {
      if (!authToken) {
        res.json(createJSONResult(-2));
      } else {
        res.json(createJSONResult({
          result: -2,
          token,
          uid,
        }));
      }
      return;
    }

    const match = await bcrypt.compare(password, user.password);
    if (match) {
      res.cookie('token', user.id, { signed: true, /*secure: true*/ });
      res.cookie('uid', user.id);

      token = cookieSignature.sign(user.id.toString(), config.secret_key);
      uid = user.id;
    }
    if (!authToken) {
      res.json(createJSONResult(match ? 1 : 0));
    } else {
      res.json(createJSONResult({
        result: match ? 1 : 0,
        token,
        uid,
      }));
    }
  } else {
    if (!authToken) {
      res.json(createJSONResult(-1));
    } else {
      res.json(createJSONResult({
        result: -1,
        token,
        uid,
      }));
    }
  }
}));

router.post('/login_with_key', authMiddleware, aclMiddleware('users:login_with_key'), asyncHandler(async (req, res, next) => {
  const { email, key, authToken } = req.body;
  let token = null;
  let uid = null;

  const user = await User.findOne({
    where: {
      email: email.toLowerCase(),
    },
  });

  if (user) {
    const match = await usersLib.checkLoginKey(user.email, key);
    if (match) {
      res.cookie('token', user.id, { signed: true, /*secure: true*/ });
      res.cookie('uid', user.id);

      token = cookieSignature.sign(user.id.toString(), config.secret_key);
      uid = user.id;
    }
    if (!authToken) {
      res.json(createJSONResult(match ? 1 : 0));
    } else {
      res.json(createJSONResult({
        result: match ? 1 : 0,
        token,
        uid,
      }));
    }
  } else {
    if (!authToken) {
      res.json(createJSONResult(-1));
    } else {
      res.json(createJSONResult({
        result: -1,
        token,
        uid,
      }));
    }
  }
}));

router.post('/request_login_key', authMiddleware, aclMiddleware('users:request_login_key'), asyncHandler(async (req, res, next) => {
  const { email } = req.body;

  const user = await User.findOne({
    where: {
      email: email.toLowerCase(),
    },
  });

  if (user) {
    const loginKey = await usersLib.createLoginKey(user.email);

    //console.log('loginKey:', loginKey);

    const _config = await configLib.get();

    await mailerLib.sendFromTemplate({
      message: {
        from: config.robotEmailFrom,
        to: user.email,
        subject: config.emailSubjects.forgotPassword,
      },
      template: 'forgot_password',
      data: {
        user: user.toJSON(),
        config: _config,
        loginKey,
      },
    });

    res.json(createJSONResult(true));
  } else {
    res.json(createJSONResult(null));
  }
}));

router.post('/logout', authMiddleware, aclMiddleware('users:logout'), asyncHandler(async (req, res, next) => {
  res.clearCookie('token');
  res.json(createJSONResult(true));
}));

router.post('/register', authMiddleware, aclMiddleware('users:register'), asyncHandler(async (req, res, next) => {
  const result = await sequelize.transaction(async (t) => {

    const checkUser = await User.findOne({
      where: { email: req.body.email },
    });
    if (checkUser) throw Error('Oops, user with this email already exists!');

    const company = await Company.findOne({
      where: { isPrimary: true },
    });
    if (!company) throw Error('Primary Company is not defined.');

    const user = await User.create({
      ...req.body,
      isActive: true,
      isAPIActive: false,
      CompanyId: company.id,
      role: 'client',
    });

    const group = await Group.findOne({
      where: { isDefault: true },
    });
    if (!group) throw Error('Default User Group is not defined.');

    await UserGroup.create({
      UserId: user.id,
      GroupId: group.id,
    });

    const _config = await configLib.get();
    if (_config.newUserNotification) {
      await mailerLib.sendFromTemplate({
        message: {
          from: config.robotEmailFrom,
          to: _config.newUserNotificationEmail,
          subject: config.emailSubjects.newUserNotification,
        },
        template: 'new_user_notification',
        data: {
          user: {
            prettyName: !!user.firstName || user.lastName ? `${ user.firstName } ${ user.lastName }` : 'Анонимный пользователь',
            companyName: user.isCompany ? user.companyName : 'Частное лицо',
            phone: user.phone != '' ? user.phone : 'не указан',
            email: user.email
          },
          config: _config,
        },
      });
    }

    return user;
  });
  res.json(createJSONResult(result));
}));

router.get('/online_count', authMiddleware, aclMiddleware('users:online_count'), asyncHandler(async (req, res, next) => {
  const count = await User.count({
    where: {
      lastActive: {
        [Sequelize.Op.between]: [moment().subtract(2, 'minutes'), moment()],
      }
    },
  });
  res.json(createJSONResult(count));
}));

router.get('/set_push_token', authMiddleware, aclMiddleware('users:set_push_token'), asyncHandler(async (req, res, next) => {
  const { pushToken = '', action = 'add' } = req.query;

  const obj = await PushToken.findOne({
    where: { pushToken }
  });

  if (action == 'add') {
    if (!obj) {
      await PushToken.create({
        UserId: req.user.id,
        pushToken,
      });
    }
  }
  if (action == 'delete') {
    if (obj) {
      await obj.destroy();
    }
  }

  res.json(createJSONResult(true));
}));

module.exports = router;
