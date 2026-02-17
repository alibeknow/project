'use strict';

const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '.testdb.json');

module.exports = async function globalTeardown() {
  console.log('\n[E2E globalTeardown] Cleaning up...');

  // Stop testcontainer if it was started
  if (global.__PG_CONTAINER__) {
    await global.__PG_CONTAINER__.stop();
    console.log('[E2E globalTeardown] PostgreSQL container stopped.');
  }

  // Remove temp config file
  if (fs.existsSync(CONFIG_FILE)) {
    fs.unlinkSync(CONFIG_FILE);
  }

  console.log('[E2E globalTeardown] Done.');
};
