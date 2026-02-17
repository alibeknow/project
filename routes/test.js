'use strict';

const express = require('express');
const router  = express.Router();

// Test endpoint — used for smoke-testing
router.get('/', (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
