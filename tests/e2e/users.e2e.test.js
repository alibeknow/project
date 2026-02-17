'use strict';

/**
 * E2E tests for /api/users
 *
 * Routes (non-REST pattern):
 *   GET  /              - list (users:list)
 *   GET  /get           - single (users:get)
 *   POST /add           - create (users:add)
 *   POST /edit          - update (users:edit)
 *   POST /delete        - delete (users:delete)
 *   GET  /online_count  - count online (users:online_count)
 *   GET  /set_push_token - push token (users:set_push_token)
 */

const { getRequest } = require('./helpers/testApp');
const { authAs }     = require('./helpers/auth');

const TEST_PASSWORD = 'TestPassword123!';

let request;
let seeds;

beforeAll(() => {
  seeds   = global.__TEST_SEEDS__;
  request = getRequest();
});

// ---------------------------------------------------------------------------
// Response format helpers
// ---------------------------------------------------------------------------

function expectSuccess(res, statusCode = 200) {
  expect(res.status).toBe(statusCode);
  expect(res.body).toHaveProperty('ts');
  expect(res.body).toHaveProperty('result');
}

function expectError(res, statusCode) {
  expect(res.status).toBe(statusCode);
  expect(res.body).toHaveProperty('error');
}

// ---------------------------------------------------------------------------
// GET /api/users — list
// ---------------------------------------------------------------------------

describe('GET /api/users (users:list)', () => {
  it('admin can list users', async () => {
    const res = await request.get('/api/users').set(authAs('admin'));

    expectSuccess(res);
    expect(res.body.result).toHaveProperty('data');
    expect(res.body.result).toHaveProperty('count');
    expect(Array.isArray(res.body.result.data)).toBe(true);
    expect(res.body.result.count).toBeGreaterThan(0);
  });

  it('password and APIKey are excluded from list response', async () => {
    const res = await request.get('/api/users').set(authAs('admin'));

    expectSuccess(res);
    const user = res.body.result.data[0];
    expect(user).not.toHaveProperty('password');
    expect(user).not.toHaveProperty('APIKey');
  });

  it('supervisor can list users', async () => {
    const res = await request.get('/api/users').set(authAs('supervisor'));
    expectSuccess(res);
  });

  it('manager can list users', async () => {
    const res = await request.get('/api/users').set(authAs('manager'));
    expectSuccess(res);
  });

  it('client cannot list users (403)', async () => {
    const res = await request.get('/api/users').set(authAs('client'));
    expectError(res, 403);
  });

  it('carrier_manager cannot list users (403)', async () => {
    const res = await request.get('/api/users').set(authAs('carrier_manager'));
    expectError(res, 403);
  });

  it('unauthenticated returns 401', async () => {
    const res = await request.get('/api/users');
    expectError(res, 401);
  });

  it('supports pagination via limit and offset', async () => {
    const res = await request
      .get('/api/users')
      .query({ limit: 1, offset: 0 })
      .set(authAs('admin'));

    expectSuccess(res);
    expect(res.body.result.data.length).toBeLessThanOrEqual(1);
    expect(res.body.result).toHaveProperty('count');
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/get — single user
// ---------------------------------------------------------------------------

describe('GET /api/users/get (users:get)', () => {
  it('admin can get any user by id', async () => {
    const res = await request
      .get('/api/users/get')
      .query({ id: seeds.userIds.client })
      .set(authAs('admin'));

    expectSuccess(res);
    expect(res.body.result).toMatchObject({
      id: seeds.userIds.client,
      email: 'test.client@e2e.local',
      role: 'client',
    });
    expect(res.body.result).not.toHaveProperty('password');
  });

  it('client can get their own profile (no id needed)', async () => {
    const res = await request
      .get('/api/users/get')
      .set(authAs('client'));

    expectSuccess(res);
    expect(res.body.result).toMatchObject({
      role: 'client',
    });
  });

  it('client cannot get another user by specifying id', async () => {
    // client role ignores ?id= param and always returns own profile
    const res = await request
      .get('/api/users/get')
      .query({ id: seeds.userIds.admin })
      .set(authAs('client'));

    expectSuccess(res);
    // Should return client's own data, not admin's
    expect(res.body.result.role).toBe('client');
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/users/get');
    expectError(res, 401);
  });

  it('response includes Company and Groups', async () => {
    const res = await request
      .get('/api/users/get')
      .set(authAs('admin'));

    expectSuccess(res);
    expect(res.body.result).toHaveProperty('Company');
    expect(res.body.result).toHaveProperty('Groups');
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/add — create user
// ---------------------------------------------------------------------------

describe('POST /api/users/add (users:add)', () => {
  let createdUserId;

  it('admin can create a new user', async () => {
    const email = `new.user.${Date.now()}@e2e.local`;

    const res = await request
      .post('/api/users/add')
      .set(authAs('admin'))
      .send({
        email,
        password: TEST_PASSWORD,
        role: 'client',
        firstName: 'NewUser',
        lastName: 'Test',
        CompanyId: seeds.companyId,
      });

    expectSuccess(res);
    expect(res.body.result).toMatchObject({
      email,
      role: 'client',
    });
    createdUserId = res.body.result.id;
  });

  it('supervisor cannot create user with admin role', async () => {
    const res = await request
      .post('/api/users/add')
      .set(authAs('supervisor'))
      .send({
        email: `elevate.${Date.now()}@e2e.local`,
        password: TEST_PASSWORD,
        role: 'admin',
      });

    expectError(res, 500);
  });

  it('client cannot create users (403)', async () => {
    const res = await request
      .post('/api/users/add')
      .set(authAs('client'))
      .send({
        email: `client.create.${Date.now()}@e2e.local`,
        password: TEST_PASSWORD,
        role: 'client',
      });

    expectError(res, 403);
  });

  it('returns 401 without auth', async () => {
    const res = await request.post('/api/users/add').send({
      email: 'no.auth@e2e.local',
      password: TEST_PASSWORD,
    });
    expectError(res, 401);
  });

  afterAll(async () => {
    if (createdUserId) {
      const models = require('../../models');
      await models.User.destroy({ where: { id: createdUserId } });
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/edit — update user
// ---------------------------------------------------------------------------

describe('POST /api/users/edit (users:edit)', () => {
  it('admin can edit any user', async () => {
    const res = await request
      .post('/api/users/edit')
      .set(authAs('admin'))
      .send({
        id: seeds.userIds.client,
        firstName: 'UpdatedFirst',
      });

    expectSuccess(res);
    expect(res.body.result.firstName).toBe('UpdatedFirst');

    // Restore original name
    await request
      .post('/api/users/edit')
      .set(authAs('admin'))
      .send({
        id: seeds.userIds.client,
        firstName: 'Client',
      });
  });

  it('client can only edit their own profile', async () => {
    const res = await request
      .post('/api/users/edit')
      .set(authAs('client'))
      .send({
        firstName: 'ClientEditedSelf',
      });

    expectSuccess(res);
    expect(res.body.result.firstName).toBe('ClientEditedSelf');

    // Restore
    await request
      .post('/api/users/edit')
      .set(authAs('client'))
      .send({ firstName: 'Client' });
  });

  it('cannot assign role higher than own privilege', async () => {
    const res = await request
      .post('/api/users/edit')
      .set(authAs('manager'))
      .send({
        id: seeds.userIds.client,
        role: 'admin',
      });

    expectError(res, 500);
  });

  it('returns 401 without auth', async () => {
    const res = await request.post('/api/users/edit').send({ firstName: 'X' });
    expectError(res, 401);
  });

  it('password is not exposed as plaintext after edit', async () => {
    const res = await request
      .post('/api/users/edit')
      .set(authAs('client'))
      .send({ firstName: 'Client' });

    if (res.body.result && res.body.result.password) {
      expect(res.body.result.password).not.toBe(TEST_PASSWORD);
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/users/delete — delete user
// ---------------------------------------------------------------------------

describe('POST /api/users/delete (users:delete)', () => {
  let tempUserId;

  beforeEach(async () => {
    const models = require('../../models');
    const tempUser = await models.User.create({
      email: `temp.delete.${Date.now()}@e2e.local`,
      password: 'TempPass123!',
      role: 'client',
      firstName: 'Temp',
      lastName: 'Delete',
      isActive: true,
      isAPIActive: false,
      CompanyId: seeds.companyId,
    }, { hooks: false });
    tempUserId = tempUser.id;
  });

  it('admin can delete a user', async () => {
    const res = await request
      .post('/api/users/delete')
      .set(authAs('admin'))
      .send({ id: tempUserId });

    expectSuccess(res);
    expect(res.body.result).toBe(1);
  });

  it('client cannot delete users (403)', async () => {
    const res = await request
      .post('/api/users/delete')
      .set(authAs('client'))
      .send({ id: tempUserId });

    expectError(res, 403);
  });

  it('returns 401 without auth', async () => {
    const res = await request.post('/api/users/delete').send({ id: 999 });
    expectError(res, 401);
  });

  it('admin can delete multiple users with array', async () => {
    const models = require('../../models');
    const tempUser2 = await models.User.create({
      email: `temp.delete2.${Date.now()}@e2e.local`,
      password: 'TempPass123!',
      role: 'client',
      firstName: 'Temp2',
      lastName: 'Delete2',
      isActive: true,
      isAPIActive: false,
      CompanyId: seeds.companyId,
    }, { hooks: false });

    const res = await request
      .post('/api/users/delete')
      .set(authAs('admin'))
      .send({ id: [tempUserId, tempUser2.id] });

    expectSuccess(res);
    expect(res.body.result).toBeGreaterThan(0);
  });

  afterEach(async () => {
    const models = require('../../models');
    await models.User.destroy({ where: { id: tempUserId }, force: true }).catch(() => {});
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/online_count
// ---------------------------------------------------------------------------

describe('GET /api/users/online_count (users:online_count)', () => {
  it('admin can get online count', async () => {
    const res = await request
      .get('/api/users/online_count')
      .set(authAs('admin'));

    expectSuccess(res);
    expect(typeof res.body.result).toBe('number');
    expect(res.body.result).toBeGreaterThanOrEqual(0);
  });

  it('client cannot get online count (403)', async () => {
    const res = await request
      .get('/api/users/online_count')
      .set(authAs('client'));

    expectError(res, 403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/users/set_push_token
// ---------------------------------------------------------------------------

describe('GET /api/users/set_push_token (users:set_push_token)', () => {
  const testToken = `ExponentPushToken[test-${Date.now()}]`;

  it('client can add a push token', async () => {
    const res = await request
      .get('/api/users/set_push_token')
      .query({ pushToken: testToken, action: 'add' })
      .set(authAs('client'));

    expectSuccess(res);
    expect(res.body.result).toBe(true);
  });

  it('client can delete a push token', async () => {
    const res = await request
      .get('/api/users/set_push_token')
      .query({ pushToken: testToken, action: 'delete' })
      .set(authAs('client'));

    expectSuccess(res);
    expect(res.body.result).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .get('/api/users/set_push_token')
      .query({ pushToken: testToken, action: 'add' });

    expectError(res, 401);
  });
});
