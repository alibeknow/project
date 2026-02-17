'use strict';

/**
 * E2E tests for /api/rates
 *
 * Routes:
 *   GET  /        - list (rates:list)
 *   GET  /get     - single (rates:get)
 *   GET  /search  - search rates (rates:search — guest allowed)
 *   POST /add     - create (rates:add)
 *   POST /edit    - update (rates:edit)
 *   POST /delete  - delete (rates:delete)
 */

const { getRequest } = require('./helpers/testApp');
const { authAs }     = require('./helpers/auth');

let request;
let seeds;

beforeAll(() => {
  seeds   = global.__TEST_SEEDS__;
  request = getRequest();
});

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
// GET /api/rates — list
// ---------------------------------------------------------------------------

describe('GET /api/rates (rates:list)', () => {
  it('admin can list rates', async () => {
    const res = await request.get('/api/rates').set(authAs('admin'));

    expectSuccess(res);
    expect(res.body.result).toHaveProperty('data');
    expect(res.body.result).toHaveProperty('count');
    expect(Array.isArray(res.body.result.data)).toBe(true);
    expect(res.body.result.count).toBeGreaterThan(0);
  });

  it('rate data includes Zone and RateType associations', async () => {
    const res = await request.get('/api/rates').set(authAs('admin'));

    expectSuccess(res);
    const rate = res.body.result.data[0];
    expect(rate).toHaveProperty('Zone');
    expect(rate).toHaveProperty('RateType');
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/rates');
    expectError(res, 401);
  });

  it('client cannot list rates (403)', async () => {
    const res = await request.get('/api/rates').set(authAs('client'));
    expectError(res, 403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/rates/get — single rate
// ---------------------------------------------------------------------------

describe('GET /api/rates/get (rates:get)', () => {
  it('admin can get a rate by id', async () => {
    const res = await request
      .get('/api/rates/get')
      .query({ id: seeds.rateId })
      .set(authAs('admin'));

    expectSuccess(res);
    expect(res.body.result).toMatchObject({
      id: seeds.rateId,
      name: 'Test Standard Rate',
    });
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/rates/get').query({ id: seeds.rateId });
    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/rates/search — search (guest accessible)
// ---------------------------------------------------------------------------

describe('GET /api/rates/search (rates:search — guest accessible)', () => {
  it('accessible without authentication', async () => {
    const res = await request
      .get('/api/rates/search')
      .query({ countryCodeFrom: 'RU', countryCodeTo: 'KZ' });

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expectSuccess(res);
  });

  it('returns array of rates for valid from/to countries', async () => {
    const res = await request
      .get('/api/rates/search')
      .query({ countryCodeFrom: 'RU', countryCodeTo: 'KZ' });

    expectSuccess(res);
    expect(Array.isArray(res.body.result) || res.body.result === null).toBe(true);
  });

  it('returns result with rate data', async () => {
    const res = await request
      .get('/api/rates/search')
      .query({ countryCodeFrom: 'RU', countryCodeTo: 'KZ' });

    expectSuccess(res);
    if (res.body.result && res.body.result.length > 0) {
      expect(res.body.result[0]).toHaveProperty('id');
    }
  });

  it('returns empty/null for non-existent route', async () => {
    const res = await request
      .get('/api/rates/search')
      .query({ countryCodeFrom: 'ZZ', countryCodeTo: 'XX' });

    expectSuccess(res);
    expect(
      res.body.result === null || (Array.isArray(res.body.result) && res.body.result.length === 0)
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST /api/rates/add — create rate
// ---------------------------------------------------------------------------

describe('POST /api/rates/add (rates:add)', () => {
  let createdRateId;

  it('admin can create a rate', async () => {
    const res = await request
      .post('/api/rates/add')
      .set(authAs('admin'))
      .send({
        name: 'New Test Rate',
        price: 750,
        minWeight: 0,
        maxWeight: 10,
        minDeclaredValue: 0,
        maxDeclaredValue: 100000,
        timeInTransit: 3,
        ZoneId: seeds.zoneId,
        RateTypeId: seeds.rtExpId,
      });

    expectSuccess(res);
    expect(res.body.result).toMatchObject({ name: 'New Test Rate' });
    createdRateId = res.body.result.id;
  });

  it('client cannot create rates (403)', async () => {
    const res = await request
      .post('/api/rates/add')
      .set(authAs('client'))
      .send({
        name: 'Unauthorized Rate',
        price: 100,
        ZoneId: seeds.zoneId,
        RateTypeId: seeds.rtStdId,
      });

    expectError(res, 403);
  });

  it('returns 401 without auth', async () => {
    const res = await request.post('/api/rates/add').send({ name: 'X' });
    expectError(res, 401);
  });

  afterAll(async () => {
    if (createdRateId) {
      const models = require('../../models');
      await models.Rate.destroy({ where: { id: createdRateId } });
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/rates/edit — update rate
// ---------------------------------------------------------------------------

describe('POST /api/rates/edit (rates:edit)', () => {
  it('admin can edit a rate', async () => {
    const res = await request
      .post('/api/rates/edit')
      .set(authAs('admin'))
      .send({ id: seeds.rateId, name: 'Updated Rate Name' });

    expectSuccess(res);
    expect(res.body.result.name).toBe('Updated Rate Name');

    // Restore
    await request
      .post('/api/rates/edit')
      .set(authAs('admin'))
      .send({ id: seeds.rateId, name: 'Test Standard Rate' });
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post('/api/rates/edit')
      .send({ id: seeds.rateId, name: 'X' });
    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/rates/delete — delete rate
// ---------------------------------------------------------------------------

describe('POST /api/rates/delete (rates:delete)', () => {
  let tempRateId;

  beforeEach(async () => {
    const models = require('../../models');
    const tmpRate = await models.Rate.create({
      name: `Temp Rate ${Date.now()}`,
      price: 100,
      minWeight: 0,
      maxWeight: 5,
      minDeclaredValue: 0,
      maxDeclaredValue: 50000,
      timeInTransit: 1,
      ZoneId: seeds.zoneId,
      RateTypeId: seeds.rtExpId,
    });
    tempRateId = tmpRate.id;
  });

  it('admin can delete a rate', async () => {
    const res = await request
      .post('/api/rates/delete')
      .set(authAs('admin'))
      .send({ id: tempRateId });

    expectSuccess(res);
    expect(res.body.result).toBe(1);
  });

  it('returns 401 without auth', async () => {
    const res = await request.post('/api/rates/delete').send({ id: tempRateId });
    expectError(res, 401);
  });

  afterEach(async () => {
    const models = require('../../models');
    await models.Rate.destroy({ where: { id: tempRateId }, force: true }).catch(() => {});
  });
});
