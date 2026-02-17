'use strict';

/**
 * Creates a supertest request instance bound to the Express app.
 * App is instantiated once and reused across all tests in the file.
 */

let _app = null;
let _request = null;

function getApp() {
  if (!_app) {
    _app = require('../../../app');
  }
  return _app;
}

function getRequest() {
  if (!_request) {
    const supertest = require('supertest');
    _request = supertest(getApp());
  }
  return _request;
}

/**
 * Reset cached app instance (use between test suites if needed).
 */
function resetApp() {
  _app = null;
  _request = null;
}

module.exports = { getApp, getRequest, resetApp };
