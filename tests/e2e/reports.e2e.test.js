'use strict';

/**
 * E2E tests for /api/reports
 *
 * Routes that ACTUALLY EXIST in routes/reports.js:
 *   GET /           - reports:list (returns JSON true)
 *   GET /orders     - reports:orders — generates and downloads an xlsx file
 *
 * Routes /orders/export, /income, /carriers, /customers do NOT exist.
 *
 * NOTE: GET /orders returns a file download (xlsx via res.download()),
 * NOT a JSON response. Tests verify status codes only.
 */

const { getRequest } = require('./helpers/testApp');
const { authAs }     = require('./helpers/auth');

let request;

beforeAll(() => {
  request = getRequest();
});

// ---------------------------------------------------------------------------
// GET /api/reports/orders — xlsx file download
// ---------------------------------------------------------------------------

describe('GET /api/reports/orders', () => {
  it('admin can download orders report (200 xlsx)', async () => {
    const res = await request
      .get('/api/reports/orders')
      .set(authAs('admin'));

    // Route generates an xlsx file and sends it via res.download()
    expect(res.status).toBe(200);
  });

  it('supervisor can download orders report (200 xlsx)', async () => {
    const res = await request
      .get('/api/reports/orders')
      .set(authAs('supervisor'));

    expect(res.status).toBe(200);
  });

  it('client gets error (lacks reports:orders_type_full permission)', async () => {
    // Client has reports:orders but NOT reports:orders_type_full (default type).
    // Route throws Error('Not Allowed!') -> express-async-handler -> 500
    const res = await request
      .get('/api/reports/orders')
      .set(authAs('client'));

    expect([403, 500]).toContain(res.status);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/reports/orders');

    expect(res.status).toBe(401);
    expect(res.body).toHaveProperty('error');
  });
});

// ---------------------------------------------------------------------------
// Routes /orders/export, /income, /carriers, /customers do NOT exist
// ---------------------------------------------------------------------------

describe('Non-existent report routes return 404', () => {
  const missing = [
    '/api/reports/orders/export',
    '/api/reports/income',
    '/api/reports/carriers',
    '/api/reports/customers',
  ];

  missing.forEach((path) => {
    it(`GET ${path} returns 404`, async () => {
      const res = await request.get(path).set(authAs('admin'));
      expect(res.status).toBe(404);
    });
  });
});
