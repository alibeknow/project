'use strict';

/**
 * E2E tests for /api/payment_notifications
 *
 * Routes:
 *   POST /pay          - CloudPayments payment webhook
 *   POST /pay_confirm  - Payment confirmation webhook
 *   POST /fail         - Payment failure webhook
 *   POST /test         - Test webhook
 *
 * NOTE: These endpoints use CloudPayments HMAC signature verification.
 * Tests verify endpoint reachability; actual signature validation is
 * tested end-to-end with the real algorithm.
 */

const { getRequest } = require('./helpers/testApp');

let request;
let seeds;

beforeAll(() => {
  seeds   = global.__TEST_SEEDS__;
  request = getRequest();
});

function expectError(res, statusCode) {
  expect(res.status).toBe(statusCode);
  expect(res.body).toHaveProperty('error');
}

// CloudPayments webhook payload structure
function buildWebhookPayload(orderId, status = 'Completed') {
  return {
    TransactionId: Math.floor(Math.random() * 1000000),
    Amount: 500,
    Currency: 'KZT',
    PaymentAmount: 500,
    PaymentCurrency: 'KZT',
    InvoiceId: String(orderId),
    AccountId: seeds.userIds.client,
    Status: status,
    GatewayName: 'Test',
    OperationType: 'Payment',
    Data: JSON.stringify({ orderId }),
  };
}

// ---------------------------------------------------------------------------
// POST /api/payment_notifications/test
// ---------------------------------------------------------------------------

describe('POST /api/payment_notifications/test', () => {
  it('test endpoint is accessible', async () => {
    const res = await request
      .post('/api/payment_notifications/test')
      .send({ test: true });

    expect(res.status).not.toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/payment_notifications/pay — main payment webhook
// ---------------------------------------------------------------------------

describe('POST /api/payment_notifications/pay', () => {
  it('endpoint is reachable (may reject invalid signature)', async () => {
    const payload = buildWebhookPayload(seeds.orderId, 'Completed');

    const res = await request
      .post('/api/payment_notifications/pay')
      .send(payload);

    // CloudPayments returns { code: 0 } for success or { code: 13 } for invalid sig
    // We just verify the endpoint is reachable and not 404/500
    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(500);
  });

  it('handles Declined status webhook', async () => {
    const payload = buildWebhookPayload(seeds.orderId, 'Declined');

    const res = await request
      .post('/api/payment_notifications/pay')
      .send(payload);

    expect(res.status).not.toBe(404);
  });
});

// ---------------------------------------------------------------------------
// POST /api/payment_notifications/pay_confirm
// ---------------------------------------------------------------------------

describe('POST /api/payment_notifications/pay_confirm', () => {
  it('endpoint is reachable', async () => {
    const payload = buildWebhookPayload(seeds.orderId, 'Authorized');

    const res = await request
      .post('/api/payment_notifications/pay_confirm')
      .send(payload);

    expect(res.status).not.toBe(404);
    expect(res.status).not.toBe(500);
  });
});

// ---------------------------------------------------------------------------
// POST /api/payment_notifications/fail
// ---------------------------------------------------------------------------

describe('POST /api/payment_notifications/fail', () => {
  it('endpoint is reachable', async () => {
    const payload = buildWebhookPayload(seeds.orderId, 'Declined');

    const res = await request
      .post('/api/payment_notifications/fail')
      .send(payload);

    expect(res.status).not.toBe(404);
  });
});
