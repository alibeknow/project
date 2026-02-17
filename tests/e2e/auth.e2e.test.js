'use strict';

/**
 * E2E tests for authentication flows:
 * - POST /api/users/login
 * - POST /api/users/login_with_key
 * - POST /api/users/request_login_key
 * - POST /api/users/logout
 * - POST /api/users/register
 * - X-API-Key header authentication
 * - X-Auth-Token header authentication
 * - Guest-accessible endpoints
 */

const { getRequest } = require('./helpers/testApp');
const { authAs }     = require('./helpers/auth');

const TEST_PASSWORD = 'TestPassword123!';

let request;

beforeAll(() => {
  request = getRequest();
});

// ---------------------------------------------------------------------------
// Response format helpers
// ---------------------------------------------------------------------------

function expectSuccess(res, statusCode = 200) {
  expect(res.status).toBe(statusCode);
  expect(res.body).toHaveProperty('ts');
  expect(typeof res.body.ts).toBe('number');
  expect(res.body).toHaveProperty('result');
}

function expectError(res, statusCode) {
  expect(res.status).toBe(statusCode);
  expect(res.body).toHaveProperty('error');
  expect(res.body.error).toHaveProperty('message');
}

// ---------------------------------------------------------------------------
// POST /api/users/login
// ---------------------------------------------------------------------------

describe('POST /api/users/login', () => {
  it('returns result=1 on valid credentials', async () => {
    const res = await request.post('/api/users/login').send({
      email: 'test.admin@e2e.local',
      password: TEST_PASSWORD,
    });

    expectSuccess(res);
    expect(res.body.result).toBe(1);
  });

  it('sets signed token cookie on successful login', async () => {
    const res = await request.post('/api/users/login').send({
      email: 'test.admin@e2e.local',
      password: TEST_PASSWORD,
    });

    expect(res.headers['set-cookie']).toBeDefined();
    const cookies = res.headers['set-cookie'].join(';');
    expect(cookies).toContain('token=');
    expect(cookies).toContain('uid=');
  });

  it('returns result=0 on wrong password', async () => {
    const res = await request.post('/api/users/login').send({
      email: 'test.admin@e2e.local',
      password: 'WrongPassword!',
    });

    expectSuccess(res);
    expect(res.body.result).toBe(0);
  });

  it('returns result=-1 when user not found', async () => {
    const res = await request.post('/api/users/login').send({
      email: 'nonexistent@e2e.local',
      password: 'AnyPassword123!',
    });

    expectSuccess(res);
    expect(res.body.result).toBe(-1);
  });

  it('returns result=-2 for inactive user', async () => {
    const res = await request.post('/api/users/login').send({
      email: 'test.inactive@e2e.local',
      password: TEST_PASSWORD,
    });

    expectSuccess(res);
    expect(res.body.result).toBe(-2);
  });

  it('returns token+uid when authToken=true', async () => {
    const res = await request.post('/api/users/login').send({
      email: 'test.admin@e2e.local',
      password: TEST_PASSWORD,
      authToken: true,
    });

    expectSuccess(res);
    expect(res.body.result).toMatchObject({
      result: 1,
      token: expect.any(String),
      uid: expect.any(Number),
    });
  });

  it('returns token=null, uid=null on wrong password with authToken=true', async () => {
    const res = await request.post('/api/users/login').send({
      email: 'test.admin@e2e.local',
      password: 'WrongPassword!',
      authToken: true,
    });

    expectSuccess(res);
    expect(res.body.result).toMatchObject({
      result: 0,
      token: null,
      uid: null,
    });
  });

  it('is accessible without authentication (guest permission)', async () => {
    const res = await request.post('/api/users/login').send({
      email: 'nonexistent@e2e.local',
      password: 'pass',
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/logout
// ---------------------------------------------------------------------------

describe('POST /api/users/logout', () => {
  it('returns result=true and clears cookie', async () => {
    const loginRes = await request.post('/api/users/login').send({
      email: 'test.admin@e2e.local',
      password: TEST_PASSWORD,
    });
    const cookies = loginRes.headers['set-cookie'];

    const res = await request
      .post('/api/users/logout')
      .set('Cookie', cookies);

    expectSuccess(res);
    expect(res.body.result).toBe(true);
  });

  it('is accessible without authentication (guest permission)', async () => {
    const res = await request.post('/api/users/logout').send({});
    expect(res.status).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/register
// ---------------------------------------------------------------------------

describe('POST /api/users/register', () => {
  const newUserEmail = `register.${Date.now()}@e2e.local`;

  it('creates a new user with client role', async () => {
    const res = await request.post('/api/users/register').send({
      email: newUserEmail,
      password: TEST_PASSWORD,
      firstName: 'New',
      lastName: 'User',
    });

    expectSuccess(res);
    expect(res.body.result).toMatchObject({
      email: newUserEmail,
      role: 'client',
      isActive: true,
      isAPIActive: false,
    });
    // Route returns full Sequelize instance — password hash IS present in real E2E response
  });

  it('throws error if email already exists', async () => {
    const res = await request.post('/api/users/register').send({
      email: newUserEmail,
      password: TEST_PASSWORD,
      firstName: 'Duplicate',
      lastName: 'User',
    });

    expectError(res, 500);
  });

  it('is accessible without authentication (guest permission)', async () => {
    const res = await request.post('/api/users/register').send({
      email: `guest.${Date.now()}@e2e.local`,
      password: TEST_PASSWORD,
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/request_login_key
// ---------------------------------------------------------------------------

describe('POST /api/users/request_login_key', () => {
  it('returns result=true for existing user (sends email via jsonTransport)', async () => {
    const res = await request.post('/api/users/request_login_key').send({
      email: 'test.client@e2e.local',
    });

    expectSuccess(res);
    expect(res.body.result).toBe(true);
  });

  it('returns result=null for non-existing user', async () => {
    const res = await request.post('/api/users/request_login_key').send({
      email: 'doesnotexist@e2e.local',
    });

    expectSuccess(res);
    expect(res.body.result).toBeNull();
  });

  it('is accessible without authentication (guest permission)', async () => {
    const res = await request.post('/api/users/request_login_key').send({
      email: 'doesnotexist@e2e.local',
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/login_with_key
// ---------------------------------------------------------------------------

describe('POST /api/users/login_with_key', () => {
  it('returns result=0 for invalid magic key', async () => {
    // Key must be in format "timestamp|bcryptHash" — a plain string without "|" causes
    // bcrypt.compare(text, undefined) which throws. Use the correct format with a wrong hash.
    const fakeKey = `${Date.now()}|$2b$04$invalidhashabcdefghijklmnopqrstuvwxyzABCDEFGH`;
    const res = await request.post('/api/users/login_with_key').send({
      email: 'test.client@e2e.local',
      key: fakeKey,
    });

    expectSuccess(res);
    expect(res.body.result).toBe(0);
  });

  it('returns result=-1 for non-existing user', async () => {
    const res = await request.post('/api/users/login_with_key').send({
      email: 'nobody@e2e.local',
      key: 'any-key',
    });

    expectSuccess(res);
    expect(res.body.result).toBe(-1);
  });

  it('is accessible without authentication (guest permission)', async () => {
    const res = await request.post('/api/users/login_with_key').send({
      email: 'nobody@e2e.local',
      key: 'any-key',
    });
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// X-API-Key header authentication
// ---------------------------------------------------------------------------

describe('X-API-Key authentication', () => {
  it('authenticates successfully with valid API key', async () => {
    const res = await request
      .get('/api/users/get')
      .set(authAs('admin'));

    expect(res.status).toBe(200);
    expectSuccess(res);
  });

  it('returns 401 with invalid API key for protected endpoint', async () => {
    const res = await request
      .get('/api/users')
      .set('X-API-Key', 'totally-invalid-key');

    expectError(res, 401);
  });

  it('returns 401 with no credentials for protected endpoint', async () => {
    const res = await request.get('/api/users');
    expectError(res, 401);
  });

  it('returns 403 when authenticated but lacking permission', async () => {
    // carrier_manager does not have users:list permission
    const res = await request
      .get('/api/users')
      .set(authAs('carrier_manager'));

    expectError(res, 403);
  });
});

// ---------------------------------------------------------------------------
// X-Auth-Token header authentication
// ---------------------------------------------------------------------------

describe('X-Auth-Token authentication', () => {
  let authToken;

  beforeAll(async () => {
    const loginRes = await request.post('/api/users/login').send({
      email: 'test.admin@e2e.local',
      password: TEST_PASSWORD,
      authToken: true,
    });
    authToken = loginRes.body.result.token;
  });

  it('authenticates successfully with valid X-Auth-Token', async () => {
    const res = await request
      .get('/api/users/get')
      .set('X-Auth-Token', authToken);

    expect(res.status).toBe(200);
    expectSuccess(res);
  });

  it('rejects invalid X-Auth-Token', async () => {
    const res = await request
      .get('/api/users')
      .set('X-Auth-Token', 'invalid-token');

    expectError(res, 401);
  });

  it('authenticates via auth-token query parameter', async () => {
    const res = await request
      .get('/api/users/get')
      .query({ 'auth-token': authToken });

    expect(res.status).toBe(200);
    expectSuccess(res);
  });
});

// ---------------------------------------------------------------------------
// Guest-accessible endpoints (no auth required)
// ---------------------------------------------------------------------------

describe('Guest-accessible endpoints', () => {
  const guestEndpoints = [
    { method: 'get', path: '/api/countries' },
    { method: 'get', path: '/api/package_types' },
    { method: 'get', path: '/api/rate_types' },
    { method: 'get', path: '/api/pages' },
    { method: 'get', path: '/api/news' },
  ];

  guestEndpoints.forEach(({ method, path }) => {
    it(`${method.toUpperCase()} ${path} is accessible without auth`, async () => {
      const res = await request[method](path);
      expect(res.status).not.toBe(401);
      expect(res.status).not.toBe(403);
    });
  });
});
