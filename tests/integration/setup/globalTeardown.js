'use strict';

const fs   = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '.testdb.json');

module.exports = async function globalTeardown() {
  console.log('\n[Integration globalTeardown] Cleaning up...');

  if (global.__PG_CONTAINER__) {
    await global.__PG_CONTAINER__.stop();
    console.log('[Integration globalTeardown] PostgreSQL container stopped.');
  }

  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }

  console.log('[Integration globalTeardown] Done.');
};
