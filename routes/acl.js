const express = require('express');
const router = express.Router();
const asyncHandler = require('express-async-handler');
const authMiddleware = require('../middleware/authMiddleware');
const aclMiddleware = require('../middleware/aclMiddleware');
const { createJSONError, createJSONResult } = require('../helpers/jsonResponce');

const acl = require('../acl');


router.get('/', authMiddleware, aclMiddleware('acl:list'), asyncHandler(async (req, res, next) => {
  const role = req.query.role;
  const perms = (role) ? acl.getPerms(role) : acl.perms;

  res.json(createJSONResult(perms));
}));

router.get('/get', authMiddleware, aclMiddleware('acl:get'), asyncHandler(async (req, res, next) => {
  const role = (req.user && req.user.role) ? req.user.role : 'guest';
  const perms = acl.getPerms(role);

  res.json(createJSONResult(perms));
}));

router.get('/roles', authMiddleware, aclMiddleware('acl:roles'), asyncHandler(async (req, res, next) => {
  const roles = acl.roles;
  res.json(createJSONResult(roles));
}));

module.exports = router;
