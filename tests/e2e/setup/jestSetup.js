'use strict';

/**
 * Runs in each test worker process BEFORE any test modules are loaded.
 * Reads DB connection info + seeds + API keys from the file written by globalSetup,
 * sets env vars so that config/db.js connects to the test container,
 * and exposes seeds & API keys as globals for test files.
 */

const fs   = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '.testdb.json');

if (!fs.existsSync(CONFIG_FILE)) {
  throw new Error(
    `[jestSetup] ${CONFIG_FILE} not found. ` +
    'Make sure globalSetup ran successfully (Docker running or DB_TEST_* env vars set).'
  );
}

const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));

// ── DB connection vars — must be set before any model/sequelize require ──────
process.env.NODE_ENV    = 'test';
process.env.DB_HOSTNAME = config.host;
process.env.DB_PORT     = String(config.port);
process.env.DB_NAME     = config.database;
process.env.DB_USERNAME = config.username;
process.env.DB_PASSWORD = config.password;

// ── Expose seeds and API keys as globals for test files ─────────────────────
global.__TEST_SEEDS__    = config.seeds;
global.__TEST_API_KEYS__ = config.API_KEYS;
