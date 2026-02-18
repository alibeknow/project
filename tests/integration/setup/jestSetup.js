'use strict';

const fs   = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '.testdb.json');

if (!fs.existsSync(CONFIG_FILE)) {
  throw new Error(`[jestSetup] ${CONFIG_FILE} not found. Make sure globalSetup ran successfully.`);
}

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));

process.env.NODE_ENV    = 'test';
process.env.DB_HOSTNAME = config.host;
process.env.DB_PORT     = String(config.port);
process.env.DB_NAME     = config.database;
process.env.DB_USERNAME = config.username;
process.env.DB_PASSWORD = config.password;

global.__TEST_SEEDS__    = config.seeds;
global.__TEST_API_KEYS__ = config.API_KEYS;
