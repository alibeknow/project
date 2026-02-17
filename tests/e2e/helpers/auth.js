'use strict';

/**
 * Authentication helpers for E2E tests.
 *
 * Uses the X-API-Key header — each role has a fixed API key seeded by globalSetup.
 * API keys are exposed as global.__TEST_API_KEYS__ by jestSetup.js.
 */

/**
 * Returns supertest auth header for a given role.
 * Usage: request.get('/api/users').set(authAs('admin'))
 */
function authAs(role) {
  const keys = global.__TEST_API_KEYS__;
  if (!keys) throw new Error('[authAs] global.__TEST_API_KEYS__ is not set. Is jestSetup.js configured?');
  const key = keys[role];
  if (!key) throw new Error(`[authAs] Unknown role: "${role}". Valid roles: ${Object.keys(keys).join(', ')}`);
  return { 'X-API-Key': key };
}

/**
 * Performs login via POST /api/users/login and returns the X-Auth-Token.
 * Use this to test the cookie/token auth flow specifically.
 */
async function loginAndGetToken(request, email, password) {
  const res = await request
    .post('/api/users/login')
    .send({ email, password, authToken: true });

  if (res.body.result && res.body.result.result === 1) {
    return {
      token: res.body.result.token,
      uid:   res.body.result.uid,
      headers: { 'X-Auth-Token': res.body.result.token },
    };
  }
  return null;
}

module.exports = { authAs, loginAndGetToken };
