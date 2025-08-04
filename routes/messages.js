const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const JSON5 = require('json5');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');

const { Message, User, Sequelize, sequelize } = require('../models');
const processListQuery = require('../helpers/processListQuery');

const tmp = require('tmp-promise');
const fs = require('fs');
const util = require('util');
const fsWriteAsync = util.promisify(fs.write);
const dataUriToBuffer = require('data-uri-to-buffer');
const md5 = require('md5');
const config = require('../config/app');


router.get('/', authMiddleware, aclMiddleware('messages:list'), asyncHandler(async (req, res, next) => {
  const conditions = processListQuery('Message', {
    where: req.query.where,
    order: req.query.order,
    limit: req.query.limit,
    offset: req.query.offset,
  });

  const { count, rows } = await Message.findAndCountAll({
    where: conditions.where.Message,
    order: conditions.order,
    limit: conditions.limit,
    offset: conditions.offset,
  });
  res.json(createJSONResult({ data: rows, count }));
}));

router.get('/list', authMiddleware, aclMiddleware('messages:list'), asyncHandler(async (req, res, next) => {
  let {
    where,
    order = '',
    limit = 1000,
    offset = 0,
  } = req.query;

  if (order == '') order = 'id|desc';
  let [ orderField, orderType ] = order.split('|');
  let orderMessage = [[orderField, orderType]];

  where = where ? JSON5.parse(where) : {};
  //console.log(_where);

  let whereMessage = {};
  if (where.id) whereMessage.id = { [Sequelize.Op.eq]: where.id };
  if (where.isRead) whereMessage.isRead = { [Sequelize.Op.eq]: where.isRead };
  if (where.ThreadUserId) {
    whereMessage.ThreadUserId = { [Sequelize.Op.eq]: where.ThreadUserId};
  }

  let { count, rows } = await Message.findAndCountAll({
    where: whereMessage,
    order: orderMessage,
    limit,
    offset,
    include: [
      {
        model: User,
        as: 'SenderUser',
        attributes: ['firstName', 'lastName', 'email', 'prettyName', 'role'],
      }
    ],
  });

  rows = rows.map((row) => {
    if (row.attachments && Array.isArray(row.attachments)) {
      row.attachments = row.attachments.map((attachment) => {
        const signature = md5(config.secret_key + '|' + attachment.id);
        attachment.signature = signature;
        if (req.query.attachments_data && req.query.attachments_data == 'none') attachment.data = null;

        return attachment;
      })
    }
    
    return row;
  });

  res.json(createJSONResult({ data: rows.reverse(), count }));
}));

router.get('/threads/list', authMiddleware, aclMiddleware('messages:list'), asyncHandler(async (req, res, next) => {
  let {
    where,
    limit = 1000,
    offset = 0,
  } = req.query;

  const data = await Message.findAll({
    limit,
    offset,
    order: [[sequelize.col('lastMessageCreatedAt'), 'desc']],
    attributes: [
      'ThreadUserId',
      [sequelize.fn('MAX', sequelize.col('"Message"."id"')), 'lastMessageId'],
      [sequelize.literal('(SELECT u."id" FROM "Messages" AS m LEFT JOIN "Users" AS u ON u."id" = m."ThreadUserId" WHERE m.id = MAX("Message"."id"))'), 'lastMessageSenderUserId'],
      [sequelize.literal('(SELECT u."prettyName" FROM "Messages" AS m LEFT JOIN "Users" AS u ON u."id" = m."ThreadUserId" WHERE m.id = MAX("Message"."id"))'), 'lastMessageSenderPrettyName'],
      [sequelize.literal('(SELECT "createdAt" FROM "Messages" WHERE id = MAX("Message"."id"))'), 'lastMessageCreatedAt'],
      [sequelize.literal('(SELECT "text" FROM "Messages" WHERE id = MAX("Message"."id"))'), 'lastMessageText'],
      [sequelize.literal('COUNT("Message"."id") FILTER (WHERE "Message"."isRead" = false AND "Message"."ThreadUserId" = "Message"."SenderUserId")'), 'unreadMessages'],
      [sequelize.fn('COUNT', sequelize.col('"Message"."id"')), 'totalMessages'],
    ],
    group: ['ThreadUserId'],
  });

  /*const records = await sequelize.query(`
    SELECT
      "UserFromId" AS "UserFromId",
      (SELECT "prettyName" FROM "Users" WHERE id = m."UserFromId") AS "UserFrom.prettyName",
      MAX(id) AS "lastMessageId",
      (SELECT "createdAt" FROM "Messages" WHERE id = MAX(m."id")) AS "lastMessageCreatedAt",
      (SELECT "text" FROM "Messages" WHERE id = MAX(m."id")) AS "lastMessageText",
      COUNT(id) FILTER (WHERE "isRead" = FALSE) AS "unreadMessages",
      COUNT(id) AS "totalMessages"
    FROM
      (
        SELECT
          id AS id,
          "UserFromId" AS "UserFromId",
          "isRead" AS "isRead"
        FROM "Messages"
        UNION ALL
        SELECT
          id AS id,
          "UserToId" AS "UserFromId",
          TRUE AS "isRead"
        FROM "Messages"
      ) AS m
    WHERE "UserFromId" <> 1
    GROUP BY "UserFromId"
    LIMIT :limit OFFSET :offset
  `, {
    type: sequelize.QueryTypes.SELECT,
    nest: true,
    replacements: {
      limit,
      offset,
    },
  });*/

  res.json(createJSONResult(data));
}));

router.post('/mark_read', authMiddleware, aclMiddleware('messages:mark_read'), asyncHandler(async (req, res, next) => {
  const data = await Message.update({
    isRead: true,
  }, {
    where: { ThreadUserId: req.body.ThreadUserId, SenderUserId: { [Sequelize.Op.ne]: req.user.id } },
  });
  res.json(createJSONResult(data));
}));

router.post('/mark_unread', authMiddleware, aclMiddleware('messages:mark_unread'), asyncHandler(async (req, res, next) => {
  let ids = [];
  if (Array.isArray(req.body.id)) {
    ids = req.body.id;
  } else {
    ids.push(req.body.id);
  }

  for (let id of ids) {
    const obj = await Message.findOne({
      where: { ThreadUserId: id, SenderUserId: { [Sequelize.Op.eq]: id } },
      order: [['id', 'DESC']],
    });
    obj.isRead = false;
    await obj.save();
  }

  res.json(createJSONResult(ids.length));
}));

router.post('/send', authMiddleware, aclMiddleware('messages:send'), asyncHandler(async (req, res, next) => {
  const obj = await Message.create({
    ThreadUserId: req.body.ThreadUserId,
    SenderUserId: req.user.id,
    text: req.body.text,
    attachments: req.body.attachments || [],
    isRead: false,
  });
  res.json(createJSONResult(obj));
}));

router.get('/count', authMiddleware, aclMiddleware('messages:count'), asyncHandler(async (req, res, next) => {
  const data = await Message.findOne({
    attributes: [
      [sequelize.literal('COUNT("Message"."id") FILTER (WHERE "Message"."isRead" = false AND "Message"."ThreadUserId" = "Message"."SenderUserId")'), 'unread'],
      //[sequelize.fn('COUNT', sequelize.col('"Message"."id"')), 'total'],
    ],
  })

  res.json(createJSONResult(data));
}));

router.get('/user/list', authMiddleware, aclMiddleware('messages:user_list'), asyncHandler(async (req, res, next) => {
  let {
    where,
    order = '',
    limit = 1000,
    offset = 0,
  } = req.query;

  if (order == '') order = 'id|desc';
  let [ orderField, orderType ] = order.split('|');
  let orderMessage = [[orderField, orderType]];

  where = where ? JSON5.parse(where) : {};
  //console.log(_where);

  let whereMessage = {};
  if (where.id) whereMessage.id = { [Sequelize.Op.eq]: where.id };
  if (where.isRead) whereMessage.isRead = { [Sequelize.Op.eq]: where.isRead };
  whereMessage.ThreadUserId = { [Sequelize.Op.eq]: req.user.id };

  let { count, rows } = await Message.findAndCountAll({
    where: whereMessage,
    order: orderMessage,
    limit,
    offset,
    include: [
      {
        model: User,
        as: 'SenderUser',
        attributes: ['firstName', 'lastName', 'email', 'prettyName', 'role'],
      }
    ],
  });

  rows = rows.map((row) => {
    if (row.attachments && Array.isArray(row.attachments)) {
      row.attachments = row.attachments.map((attachment) => {
        const signature = md5(config.secret_key + '|' + attachment.id);
        attachment.signature = signature;
        if (req.query.attachments_data && req.query.attachments_data == 'none') attachment.data = null;

        return attachment;
      })
    }
    
    return row;
  });
  res.json(createJSONResult({ data: rows.reverse(), count }));
}));

router.post('/user/mark_read', authMiddleware, aclMiddleware('messages:user_mark_read'), asyncHandler(async (req, res, next) => {
  const data = await Message.update({
    isRead: true,
  }, {
    where: { ThreadUserId: req.user.id, SenderUserId: { [Sequelize.Op.ne]: req.user.id } },
  });
  res.json(createJSONResult(data));
}));

router.post('/user/send', authMiddleware, aclMiddleware('messages:user_send'), asyncHandler(async (req, res, next) => {
  const obj = await Message.create({
    ThreadUserId: req.user.id,
    SenderUserId: req.user.id,
    text: req.body.text,
    attachments: req.body.attachments || [],
    isRead: false,
  });
  res.json(createJSONResult(obj));
}));

router.get('/user/count', authMiddleware, aclMiddleware('messages:user_count'), asyncHandler(async (req, res, next) => {
  const data = await Message.findOne({
    attributes: [
      [sequelize.literal('COUNT("Message"."id") FILTER (WHERE "Message"."isRead" = false AND "Message"."ThreadUserId" = ' + req.user.id + ' AND "Message"."ThreadUserId" != "Message"."SenderUserId")'), 'unread'],
      //[sequelize.fn('COUNT', sequelize.col('"Message"."id"')), 'total'],
    ],
  })

  res.json(createJSONResult(data));
}));

router.get('/get', authMiddleware, aclMiddleware('messages:get'), asyncHandler(async (req, res, next) => {
  const obj = await Message.findOne({
    where: { id: req.query.id }
  });
  res.json(createJSONResult(obj));
}));

router.get('/attachment/download', authMiddleware, aclMiddleware('messages:attachment_download'), asyncHandler(async (req, res, next) => {
  const { messageId = '', attachmentId = '', signature = '' } = req.query;
  const obj = await Message.findOne({
    where: { id: messageId }
  });
  if (!obj) return res.status(404).send(createJSONError(new Error('Message Not Found')));

  const attachment = obj.attachments.filter((n) => n.id == attachmentId)[0];
  if (!attachment) return res.status(404).send(createJSONError(new Error('Attachment Not Found')));

  const hash = md5(config.secret_key + '|' + attachment.id);
  if (hash != signature) return res.status(403).send(createJSONError(new Error('Signature Invalid')));

  const {fd, path, cleanup} = await tmp.file({ prefix: 'dl_', postfix: '_' + attachment.name });
  const decoded = await dataUriToBuffer(attachment.data);
  await fsWriteAsync(fd, decoded);
  res.download(path, attachment.name, function (err) {
    if (err) {
      next(err);
    } else {
      //console.log('Sent:', path);
      cleanup();
    }
  });
}));

router.post('/add', authMiddleware, aclMiddleware('messages:add'), asyncHandler(async (req, res, next) => {
  const obj = await Message.create(req.body);
  res.json(createJSONResult(obj));
}));

router.post('/edit', authMiddleware, aclMiddleware('messages:edit'), asyncHandler(async (req, res, next) => {
  const obj = await Message.findOne({
    where: { id: req.body.id }
  });
  for (let field in req.body) {
    obj[field] = req.body[field];
  }
  const result = await obj.save();
  res.json(createJSONResult(result));
}));

router.post('/delete', authMiddleware, aclMiddleware('messages:delete'), asyncHandler(async (req, res, next) => {
  const id = req.body.id;
  if (Array.isArray(id)) {
    var where = { id: {
      [Sequelize.Op.in]: id
    } };
  } else {
    var where = { id };
  }
  const obj = await Message.destroy({
    where
  });
  res.json(createJSONResult(obj));
}));

module.exports = router;
