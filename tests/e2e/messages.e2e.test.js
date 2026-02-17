'use strict';

/**
 * E2E tests for /api/messages
 *
 * Routes:
 *   GET  /                        - list (messages:list)
 *   GET  /threads/list            - list threads (messages:threads_list)
 *   GET  /:threadId               - single thread (messages:get)
 *   POST /add                     - send message (messages:add)
 *   POST /edit                    - update message (messages:edit)
 *   POST /delete                  - delete message (messages:delete)
 *   GET  /:id/attachment/download - download attachment (guest allowed)
 */

const { getRequest } = require('./helpers/testApp');
const { authAs }     = require('./helpers/auth');

let request;
let seeds;
let createdMessageId;
let threadUserId;

beforeAll(() => {
  seeds        = global.__TEST_SEEDS__;
  request      = getRequest();
  threadUserId = seeds.userIds.client;
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
// POST /api/messages/add — send message
// ---------------------------------------------------------------------------

describe('POST /api/messages/add (messages:add)', () => {
  it('admin can send a message to a client thread', async () => {
    const res = await request
      .post('/api/messages/add')
      .set(authAs('admin'))
      .send({
        text: 'Hello from admin',
        ThreadUserId: threadUserId,
      });

    expectSuccess(res);
    expect(res.body.result).toHaveProperty('id');
    expect(res.body.result.text).toBe('Hello from admin');
    createdMessageId = res.body.result.id;
  });

  it('client can send a message', async () => {
    const res = await request
      .post('/api/messages/add')
      .set(authAs('client'))
      .send({
        text: 'Hello from client',
        ThreadUserId: threadUserId,
      });

    expectSuccess(res);
    expect(res.body.result.text).toBe('Hello from client');
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post('/api/messages/add')
      .send({ text: 'Unauthorized message', ThreadUserId: threadUserId });

    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/messages — list
// ---------------------------------------------------------------------------

describe('GET /api/messages (messages:list)', () => {
  it('admin can list all messages', async () => {
    const res = await request.get('/api/messages').set(authAs('admin'));

    expectSuccess(res);
    expect(Array.isArray(res.body.result) || res.body.result !== null).toBe(true);
  });

  it('client can list their messages', async () => {
    const res = await request.get('/api/messages').set(authAs('client'));
    expectSuccess(res);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/messages');
    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/messages/threads/list
// ---------------------------------------------------------------------------

describe('GET /api/messages/threads/list (messages:threads_list)', () => {
  it('admin can list message threads', async () => {
    const res = await request
      .get('/api/messages/threads/list')
      .set(authAs('admin'));

    expectSuccess(res);
    expect(Array.isArray(res.body.result) || res.body.result !== null).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/messages/threads/list');
    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/messages/:threadId — single thread
// ---------------------------------------------------------------------------

describe('GET /api/messages/:threadId (messages:get)', () => {
  it('admin can get messages for a specific thread user', async () => {
    const res = await request
      .get(`/api/messages/${threadUserId}`)
      .set(authAs('admin'));

    expectSuccess(res);
    expect(Array.isArray(res.body.result) || res.body.result === null).toBe(true);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get(`/api/messages/${threadUserId}`);
    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/messages/edit — update message
// ---------------------------------------------------------------------------

describe('POST /api/messages/edit (messages:edit)', () => {
  it('admin can edit a message', async () => {
    if (!createdMessageId) return;

    const res = await request
      .post('/api/messages/edit')
      .set(authAs('admin'))
      .send({ id: createdMessageId, text: 'Updated message text' });

    expectSuccess(res);
    expect(res.body.result.text).toBe('Updated message text');
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post('/api/messages/edit')
      .send({ id: createdMessageId, text: 'X' });

    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// POST /api/messages/delete — delete message
// ---------------------------------------------------------------------------

describe('POST /api/messages/delete (messages:delete)', () => {
  it('admin can delete a message', async () => {
    if (!createdMessageId) return;

    const res = await request
      .post('/api/messages/delete')
      .set(authAs('admin'))
      .send({ id: createdMessageId });

    expectSuccess(res);
    expect(res.body.result).toBe(1);
    createdMessageId = null;
  });

  it('returns 401 without auth', async () => {
    const res = await request
      .post('/api/messages/delete')
      .send({ id: 99999 });

    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/messages/:id/attachment/download (guest accessible)
// ---------------------------------------------------------------------------

describe('GET /api/messages/:id/attachment/download', () => {
  it('accessible without auth (guest permission)', async () => {
    // Non-existent attachment — should be 404 or 500, but NOT 401/403
    const res = await request.get('/api/messages/99999/attachment/download');

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
  });
});
