'use strict';

/**
 * E2E tests for /api/reports
 *
 * Routes:
 *   GET /orders          - orders report
 *   GET /orders/export   - export orders report
 *   GET /income          - income report
 *   GET /carriers        - carrier performance report
 *   GET /customers       - customer analytics
 */

const { getRequest } = require('./helpers/testApp');
const { authAs }     = require('./helpers/auth');

let request;

beforeAll(() => {
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

const today     = new Date().toISOString().split('T')[0];
const lastMonth = new Date(Date.now() - 30 * 86400000).toISOString().split('T')[0];

// ---------------------------------------------------------------------------
// GET /api/reports/orders
// ---------------------------------------------------------------------------

describe('GET /api/reports/orders', () => {
  it('admin can view orders report', async () => {
    const res = await request
      .get('/api/reports/orders')
      .query({ dateFrom: lastMonth, dateTo: today })
      .set(authAs('admin'));

    expectSuccess(res);
  });

  it('supervisor can view orders report', async () => {
    const res = await request
      .get('/api/reports/orders')
      .query({ dateFrom: lastMonth, dateTo: today })
      .set(authAs('supervisor'));

    expectSuccess(res);
  });

  it('client cannot view reports (403)', async () => {
    const res = await request
      .get('/api/reports/orders')
      .set(authAs('client'));

    expectError(res, 403);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/reports/orders');
    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/orders/export
// ---------------------------------------------------------------------------

describe('GET /api/reports/orders/export', () => {
  it('admin can export orders report', async () => {
    const res = await request
      .get('/api/reports/orders/export')
      .query({ dateFrom: lastMonth, dateTo: today, format: 'csv' })
      .set(authAs('admin'));

    expect(res.status).toBe(200);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/reports/orders/export');
    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/income
// ---------------------------------------------------------------------------

describe('GET /api/reports/income', () => {
  it('admin can view income report', async () => {
    const res = await request
      .get('/api/reports/income')
      .query({ dateFrom: lastMonth, dateTo: today })
      .set(authAs('admin'));

    expectSuccess(res);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/reports/income');
    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/carriers
// ---------------------------------------------------------------------------

describe('GET /api/reports/carriers', () => {
  it('admin can view carriers report', async () => {
    const res = await request
      .get('/api/reports/carriers')
      .query({ dateFrom: lastMonth, dateTo: today })
      .set(authAs('admin'));

    expectSuccess(res);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/reports/carriers');
    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/reports/customers
// ---------------------------------------------------------------------------

describe('GET /api/reports/customers', () => {
  it('admin can view customers report', async () => {
    const res = await request
      .get('/api/reports/customers')
      .query({ dateFrom: lastMonth, dateTo: today })
      .set(authAs('admin'));

    expectSuccess(res);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/reports/customers');
    expectError(res, 401);
  });
});
