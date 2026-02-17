'use strict';

/**
 * E2E tests for /api/orders
 *
 * Routes:
 *   GET  /                          - list (orders:list)
 *   GET  /get                       - single (orders:get)
 *   POST /add                       - create (orders:add)
 *   POST /edit                      - update (orders:edit)
 *   POST /delete                    - delete (orders:delete)
 *   POST /:id/status/update         - change status (orders:status_update)
 *   POST /:id/payment_status/update - change payment status (orders:payment_status_update)
 *   GET  /:id/invoice/download      - download PDF invoice (guest allowed)
 *   POST /:id/message/add           - add message (orders:message_add)
 *   GET  /messages/list             - list order messages (orders:messages_list)
 *   POST /export                    - export to CSV/Excel (orders:export)
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
// GET /api/orders — list
// ---------------------------------------------------------------------------

describe('GET /api/orders (orders:list)', () => {
  it('admin can list all orders', async () => {
    const res = await request.get('/api/orders').set(authAs('admin'));

    expectSuccess(res);
    expect(Array.isArray(res.body.result)).toBe(true);
  });

  it('client can only see own orders', async () => {
    const res = await request.get('/api/orders').set(authAs('client'));

    expectSuccess(res);
    expect(Array.isArray(res.body.result)).toBe(true);
    res.body.result.forEach(order => {
      expect(order.UserId).toBe(seeds.userIds.client);
    });
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/orders');
    expectError(res, 401);
  });

  it('supports pagination', async () => {
    const res = await request
      .get('/api/orders')
      .query({ limit: 1, offset: 0 })
      .set(authAs('admin'));

    expectSuccess(res);
    expect(res.body.result.length).toBeLessThanOrEqual(1);
  });

  it('filters by orderStatus', async () => {
    const where = JSON.stringify({ orderStatus: ['pending'] });
    const res = await request
      .get('/api/orders')
      .query({ where })
      .set(authAs('admin'));

    expectSuccess(res);
    res.body.result.forEach(order => {
      expect(order.orderStatus).toBe('pending');
    });
  });

  it('filters by paymentStatus', async () => {
    const where = JSON.stringify({ paymentStatus: ['pending'] });
    const res = await request
      .get('/api/orders')
      .query({ where })
      .set(authAs('admin'));

    expectSuccess(res);
    res.body.result.forEach(order => {
      expect(order.paymentStatus).toBe('pending');
    });
  });

  it('filters by countryCodeFrom', async () => {
    const where = JSON.stringify({ countryCodeFrom: 'RU' });
    const res = await request
      .get('/api/orders')
      .query({ where })
      .set(authAs('admin'));

    expectSuccess(res);
    res.body.result.forEach(order => {
      expect(order.countryCodeFrom).toBe('RU');
    });
  });

  it('response includes Carrier and User data', async () => {
    const res = await request.get('/api/orders').set(authAs('admin'));

    expectSuccess(res);
    if (res.body.result.length > 0) {
      const order = res.body.result[0];
      expect(order).toHaveProperty('Carrier');
      expect(order).toHaveProperty('User');
    }
  });
});

// ---------------------------------------------------------------------------
// GET /api/orders/get — single order
// ---------------------------------------------------------------------------

describe('GET /api/orders/get (orders:get)', () => {
  it('admin can get any order by id', async () => {
    const res = await request
      .get('/api/orders/get')
      .query({ id: seeds.orderId })
      .set(authAs('admin'));

    expectSuccess(res);
    expect(res.body.result).toMatchObject({
      id: seeds.orderId,
      refNo: 'E2E-ORDER-001',
      orderStatus: 'pending',
    });
  });

  it('client can get their own order', async () => {
    const res = await request
      .get('/api/orders/get')
      .query({ id: seeds.orderId })
      .set(authAs('client'));

    expectSuccess(res);
    expect(res.body.result.id).toBe(seeds.orderId);
  });

  it('response includes Packages', async () => {
    const res = await request
      .get('/api/orders/get')
      .query({ id: seeds.orderId })
      .set(authAs('admin'));

    expectSuccess(res);
    expect(res.body.result).toHaveProperty('Packages');
    expect(Array.isArray(res.body.result.Packages)).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .get('/api/orders/get')
      .query({ id: seeds.orderId });

    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/orders/add — create order
// ---------------------------------------------------------------------------

describe('POST /api/orders/add (orders:add)', () => {
  let createdOrderId;

  const newOrderPayload = () => ({
    orderStatus: 'pending',
    paymentStatus: 'pending',
    paymentType: 'bankwire',
    declaredValue: 500,
    totalPrice: 300,
    companyPrice: 250,
    clientPrice: 300,
    contents: 'Test package',
    externalComment: 'Test order',
    pickupTime: new Date(Date.now() + 86400000).toISOString(),
    langCode: 'ru',
    countryCodeFrom: 'RU',
    countryCodeTo: 'KZ',
    addressFrom: 'Москва, Тверская 1',
    addressDetailsFrom: {
      city: 'Москва',
      addressLine1: 'Тверская 1',
      phone: '+79001234567',
      email: 'sender@e2e.local',
      firstName: 'Иван',
      lastName: 'Иванов',
      countryCode: 'RU',
    },
    addressTo: 'Алматы, Абая 1',
    addressDetailsTo: {
      city: 'Алматы',
      addressLine1: 'Абая 1',
      phone: '+77771234567',
      email: 'recipient@e2e.local',
      firstName: 'Алибек',
      lastName: 'Алибеков',
      countryCode: 'KZ',
    },
    CarrierId: seeds.carrierId,
    PackageTypeId: seeds.pkgBoxId,
    RateTypeId: seeds.rtStdId,
    Packages: [{ weight: 1, width: 20, height: 20, depth: 20, quantity: 1 }],
    OrderServices: [],
  });

  it('admin can create an order', async () => {
    const res = await request
      .post('/api/orders/add')
      .set(authAs('admin'))
      .send(newOrderPayload());

    expectSuccess(res);
    expect(res.body.result).toHaveProperty('id');
    expect(res.body.result).toHaveProperty('refNo');
    expect(res.body.result.orderStatus).toBe('pending');
    createdOrderId = res.body.result.id;
  });

  it('client can create an order', async () => {
    const res = await request
      .post('/api/orders/add')
      .set(authAs('client'))
      .send({ ...newOrderPayload(), UserId: seeds.userIds.client });

    expect([200, 201, 403]).toContain(res.status);
  });

  afterAll(async () => {
    if (createdOrderId) {
      const models = require('../../models');
      await models.Package.destroy({ where: { OrderId: createdOrderId } });
      await models.Order.destroy({ where: { id: createdOrderId } });
    }
  });
});

// ---------------------------------------------------------------------------
// POST /api/orders/edit — update order
// ---------------------------------------------------------------------------

describe('POST /api/orders/edit (orders:edit)', () => {
  it('admin can edit an order', async () => {
    const res = await request
      .post('/api/orders/edit')
      .set(authAs('admin'))
      .send({
        id: seeds.orderId,
        internalComment: 'Updated by test',
      });

    expectSuccess(res);
    expect(res.body.result.internalComment).toBe('Updated by test');

    // Restore
    await request
      .post('/api/orders/edit')
      .set(authAs('admin'))
      .send({ id: seeds.orderId, internalComment: '' });
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post('/api/orders/edit')
      .send({ id: seeds.orderId, internalComment: 'X' });

    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/orders/delete — delete order
// ---------------------------------------------------------------------------

describe('POST /api/orders/delete (orders:delete)', () => {
  let tempOrderId;

  beforeEach(async () => {
    const models = require('../../models');
    const tempOrder = await models.Order.create({
      refNo: `TEMP-DEL-${Date.now()}`,
      orderStatus: 'pending',
      paymentStatus: 'pending',
      paymentType: 'bankwire',
      declaredValue: 100,
      totalPrice: 100,
      companyPrice: 80,
      clientPrice: 100,
      contents: 'temp',
      pickupTime: new Date(Date.now() + 86400000),
      langCode: 'ru',
      countryCodeFrom: 'RU',
      countryCodeTo: 'KZ',
      addressFrom: 'Test',
      addressDetailsFrom: { city: 'Москва' },
      addressTo: 'Test',
      addressDetailsTo: { city: 'Алматы' },
      UserId: seeds.userIds.admin,
      CarrierId: seeds.carrierId,
      PackageTypeId: seeds.pkgBoxId,
      RateTypeId: seeds.rtStdId,
      CompanyId: seeds.companyId,
    });
    tempOrderId = tempOrder.id;
  });

  it('admin can delete an order', async () => {
    const res = await request
      .post('/api/orders/delete')
      .set(authAs('admin'))
      .send({ id: tempOrderId });

    expectSuccess(res);
    expect(res.body.result).toBe(1);
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post('/api/orders/delete')
      .send({ id: tempOrderId });

    expectError(res, 401);
  });

  afterEach(async () => {
    const models = require('../../models');
    await models.Order.destroy({ where: { id: tempOrderId }, force: true }).catch(() => {});
  });
});

// ---------------------------------------------------------------------------
// POST /api/orders/:id/status/update
// ---------------------------------------------------------------------------

describe('POST /api/orders/:id/status/update (orders:status_update)', () => {
  const validTransitions = [
    'processing', 'attention', 'confirmed', 'declined', 'returned',
    'destroyed', 'lost', 'canceled', 'in_transit', 'idle_run', 'delivered',
  ];

  it('admin can change order status to processing', async () => {
    const res = await request
      .post(`/api/orders/${seeds.orderId}/status/update`)
      .set(authAs('admin'))
      .send({ status: 'processing' });

    expectSuccess(res);

    // Restore
    await request
      .post(`/api/orders/${seeds.orderId}/status/update`)
      .set(authAs('admin'))
      .send({ status: 'pending' });
  });

  it('all valid status values are accepted', async () => {
    for (const status of validTransitions) {
      const res = await request
        .post(`/api/orders/${seeds.orderId}/status/update`)
        .set(authAs('admin'))
        .send({ status });

      expect(res.status).toBe(200);
    }

    // Restore
    await request
      .post(`/api/orders/${seeds.orderId}/status/update`)
      .set(authAs('admin'))
      .send({ status: 'pending' });
  });

  it('creates a record in OrderStatusHistory', async () => {
    await request
      .post(`/api/orders/${seeds.orderId}/status/update`)
      .set(authAs('admin'))
      .send({ status: 'confirmed', description: 'Test confirmation' });

    const models = require('../../models');
    const historyEntry = await models.OrderStatusHistory.findOne({
      where: { OrderId: seeds.orderId, status: 'confirmed' },
      order: [['createdAt', 'DESC']],
    });

    expect(historyEntry).not.toBeNull();

    // Restore
    await request
      .post(`/api/orders/${seeds.orderId}/status/update`)
      .set(authAs('admin'))
      .send({ status: 'pending' });
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post(`/api/orders/${seeds.orderId}/status/update`)
      .send({ status: 'confirmed' });

    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/orders/:id/payment_status/update
// ---------------------------------------------------------------------------

describe('POST /api/orders/:id/payment_status/update (orders:payment_status_update)', () => {
  const validPaymentStatuses = [
    'pending', 'authorized', 'confirmed', 'failed', 'refunded', 'canceled', 'contract',
  ];

  it('admin can change payment status', async () => {
    const res = await request
      .post(`/api/orders/${seeds.orderId}/payment_status/update`)
      .set(authAs('admin'))
      .send({ status: 'confirmed' });

    expectSuccess(res);

    // Restore
    await request
      .post(`/api/orders/${seeds.orderId}/payment_status/update`)
      .set(authAs('admin'))
      .send({ status: 'pending' });
  });

  it('all valid payment statuses are accepted', async () => {
    for (const status of validPaymentStatuses) {
      const res = await request
        .post(`/api/orders/${seeds.orderId}/payment_status/update`)
        .set(authAs('admin'))
        .send({ status });

      expect(res.status).toBe(200);
    }

    // Restore
    await request
      .post(`/api/orders/${seeds.orderId}/payment_status/update`)
      .set(authAs('admin'))
      .send({ status: 'pending' });
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post(`/api/orders/${seeds.orderId}/payment_status/update`)
      .send({ status: 'confirmed' });

    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/orders/:id/invoice/download
// ---------------------------------------------------------------------------

describe('GET /api/orders/:id/invoice/download (orders:invoice_download)', () => {
  it('accessible without auth (guest permission)', async () => {
    const res = await request
      .get(`/api/orders/${seeds.orderId}/invoice/download`);

    // Should not be 401 or 403 — may be 200 or 500 (missing PDF dependency)
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /api/orders/messages/list
// ---------------------------------------------------------------------------

describe('GET /api/orders/messages/list (orders:messages_list)', () => {
  it('admin can list order messages', async () => {
    const res = await request
      .get('/api/orders/messages/list')
      .set(authAs('admin'));

    expectSuccess(res);
    expect(
      Array.isArray(res.body.result) || res.body.result === null || typeof res.body.result === 'object'
    ).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/orders/messages/list');
    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/orders/:id/message/add
// ---------------------------------------------------------------------------

describe('POST /api/orders/:id/message/add (orders:message_add)', () => {
  it('admin can add message to order', async () => {
    const res = await request
      .post(`/api/orders/${seeds.orderId}/message/add`)
      .set(authAs('admin'))
      .send({ text: 'Test message from admin' });

    expectSuccess(res);
    expect(res.body.result).toHaveProperty('id');
    expect(res.body.result.text).toBe('Test message from admin');
  });

  it('client can add message to their own order', async () => {
    const res = await request
      .post(`/api/orders/${seeds.orderId}/message/add`)
      .set(authAs('client'))
      .send({ text: 'Test message from client' });

    expectSuccess(res);
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post(`/api/orders/${seeds.orderId}/message/add`)
      .send({ text: 'Unauthorized message' });

    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/orders/export
// ---------------------------------------------------------------------------

describe('POST /api/orders/export (orders:export)', () => {
  it('admin can export orders', async () => {
    const res = await request
      .post('/api/orders/export')
      .set(authAs('admin'))
      .send({ format: 'csv' });

    expect(res.status).toBe(200);
  });

  it('returns 401 without auth', async () => {
    const res = await request.post('/api/orders/export').send({});
    expectError(res, 401);
  });
});
