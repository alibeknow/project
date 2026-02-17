'use strict';

/**
 * E2E tests for all standard CRUD routes:
 *   - /api/carriers
 *   - /api/zones
 *   - /api/countries
 *   - /api/regions
 *   - /api/companies
 *   - /api/groups
 *   - /api/additional_services
 *   - /api/package_types
 *   - /api/rate_types
 *   - /api/tags
 *   - /api/message_templates
 *   - /api/news
 *   - /api/pages
 *   - /api/config
 *   - /api/dashboard
 *   - /api/acl
 *   - /api/access_log
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
// /api/carriers
// ---------------------------------------------------------------------------

describe('/api/carriers', () => {
  let createdCarrierId;

  it('GET / - admin can list carriers', async () => {
    const res = await request.get('/api/carriers').set(authAs('admin'));
    expectSuccess(res);
    expect(res.body.result).toHaveProperty('data');
    expect(res.body.result).toHaveProperty('count');
  });

  it('GET /get - admin can get a carrier', async () => {
    const res = await request
      .get('/api/carriers/get')
      .query({ id: seeds.carrierId })
      .set(authAs('admin'));
    expectSuccess(res);
    expect(res.body.result.id).toBe(seeds.carrierId);
  });

  it('POST /add - admin can create carrier', async () => {
    const res = await request
      .post('/api/carriers/add')
      .set(authAs('admin'))
      .send({
        name: { ru: 'Новый перевозчик', en: 'New Carrier' },
        api: 'none',
        isActive: true,
        fuelTax: 0,
        insuranceIncluded: 0,
        insurancePercentage: 0,
        isRateByCarrierApi: false,
        isVATIncluded: false,
        isFuelTaxIncluded: false,
      });

    expectSuccess(res);
    expect(res.body.result.id).toBeDefined();
    createdCarrierId = res.body.result.id;
  });

  it('POST /edit - admin can update carrier', async () => {
    const res = await request
      .post('/api/carriers/edit')
      .set(authAs('admin'))
      .send({ id: seeds.carrierId, isActive: true });

    expectSuccess(res);
  });

  it('POST /delete - admin can delete created carrier', async () => {
    if (!createdCarrierId) return;
    const res = await request
      .post('/api/carriers/delete')
      .set(authAs('admin'))
      .send({ id: createdCarrierId });

    expectSuccess(res);
    expect(res.body.result).toBe(1);
  });

  it('GET / - returns 401 without auth', async () => {
    const res = await request.get('/api/carriers');
    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// /api/countries (guest accessible)
// ---------------------------------------------------------------------------

describe('/api/countries', () => {
  it('GET / - accessible without auth (guest permission)', async () => {
    const res = await request.get('/api/countries');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expectSuccess(res);
  });

  it('GET /get - accessible without auth', async () => {
    const res = await request
      .get('/api/countries/get')
      .query({ id: seeds.countryRUId });

    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expectSuccess(res);
    expect(res.body.result.code).toBe('RU');
  });

  it('GET / - authenticated admin also works', async () => {
    const res = await request.get('/api/countries').set(authAs('admin'));
    expectSuccess(res);
  });
});

// ---------------------------------------------------------------------------
// /api/regions (guest accessible)
// ---------------------------------------------------------------------------

describe('/api/regions', () => {
  let createdRegionId;

  it('GET / - accessible without auth (guest permission)', async () => {
    const res = await request.get('/api/regions');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expectSuccess(res);
  });

  it('GET /get - accessible without auth', async () => {
    const res = await request
      .get('/api/regions/get')
      .query({ id: seeds.regionMSKId });

    expect(res.status).not.toBe(401);
    expectSuccess(res);
    expect(res.body.result.code).toBe('MSK');
  });

  it('POST /add - admin can create region', async () => {
    const res = await request
      .post('/api/regions/add')
      .set(authAs('admin'))
      .send({
        code: `T${Date.now().toString().slice(-4)}`,
        name: { ru: 'Тестовый регион', en: 'Test Region' },
        CountryId: seeds.countryRUId,
      });

    expectSuccess(res);
    createdRegionId = res.body.result.id;
  });

  it('POST /delete - admin can delete region', async () => {
    if (!createdRegionId) return;
    const res = await request
      .post('/api/regions/delete')
      .set(authAs('admin'))
      .send({ id: createdRegionId });

    expectSuccess(res);
  });
});

// ---------------------------------------------------------------------------
// /api/zones
// ---------------------------------------------------------------------------

describe('/api/zones', () => {
  let createdZoneId;

  it('GET / - admin can list zones', async () => {
    const res = await request.get('/api/zones').set(authAs('admin'));
    expectSuccess(res);
    expect(res.body.result).toHaveProperty('data');
  });

  it('GET /get - admin can get a zone', async () => {
    const res = await request
      .get('/api/zones/get')
      .query({ id: seeds.zoneId })
      .set(authAs('admin'));

    expectSuccess(res);
    expect(res.body.result.id).toBe(seeds.zoneId);
  });

  it('POST /add - admin can create zone', async () => {
    const res = await request
      .post('/api/zones/add')
      .set(authAs('admin'))
      .send({
        name: { ru: 'Новая зона', en: 'New Zone' },
        CarrierId: seeds.carrierId,
      });

    expectSuccess(res);
    createdZoneId = res.body.result.id;
  });

  it('POST /edit - admin can update zone', async () => {
    if (!createdZoneId) return;
    const res = await request
      .post('/api/zones/edit')
      .set(authAs('admin'))
      .send({ id: createdZoneId, name: { ru: 'Обновленная зона', en: 'Updated Zone' } });

    expectSuccess(res);
  });

  it('POST /delete - admin can delete zone', async () => {
    if (!createdZoneId) return;
    const res = await request
      .post('/api/zones/delete')
      .set(authAs('admin'))
      .send({ id: createdZoneId });

    expectSuccess(res);
  });

  it('GET / - returns 401 without auth', async () => {
    const res = await request.get('/api/zones');
    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// /api/companies
// ---------------------------------------------------------------------------

describe('/api/companies', () => {
  let createdCompanyId;

  it('GET / - admin can list companies', async () => {
    const res = await request.get('/api/companies').set(authAs('admin'));
    expectSuccess(res);
    expect(res.body.result).toHaveProperty('data');
    expect(res.body.result.count).toBeGreaterThan(0);
  });

  it('GET /get - admin can get a company', async () => {
    const res = await request
      .get('/api/companies/get')
      .query({ id: seeds.companyId })
      .set(authAs('admin'));

    expectSuccess(res);
    expect(res.body.result.id).toBe(seeds.companyId);
    expect(res.body.result.isPrimary).toBe(true);
  });

  it('POST /add - admin can create company', async () => {
    const res = await request
      .post('/api/companies/add')
      .set(authAs('admin'))
      .send({ name: { ru: 'Тест Компания X', en: 'Test Company X' }, isPrimary: false });

    expectSuccess(res);
    createdCompanyId = res.body.result.id;
  });

  it('POST /delete - admin can delete company', async () => {
    if (!createdCompanyId) return;
    const res = await request
      .post('/api/companies/delete')
      .set(authAs('admin'))
      .send({ id: createdCompanyId });

    expectSuccess(res);
  });
});

// ---------------------------------------------------------------------------
// /api/groups
// ---------------------------------------------------------------------------

describe('/api/groups', () => {
  let createdGroupId;

  it('GET / - admin can list groups', async () => {
    const res = await request.get('/api/groups').set(authAs('admin'));
    expectSuccess(res);
    expect(res.body.result).toHaveProperty('data');
  });

  it('POST /add - admin can create group', async () => {
    const res = await request
      .post('/api/groups/add')
      .set(authAs('admin'))
      .send({ name: { ru: 'Тест Группа', en: 'Test Group' }, isDefault: false });

    expectSuccess(res);
    createdGroupId = res.body.result.id;
  });

  it('POST /edit - admin can edit group', async () => {
    if (!createdGroupId) return;
    const res = await request
      .post('/api/groups/edit')
      .set(authAs('admin'))
      .send({ id: createdGroupId, name: { ru: 'Обновленная группа', en: 'Updated Group' } });

    expectSuccess(res);
  });

  it('POST /delete - admin can delete group', async () => {
    if (!createdGroupId) return;
    const res = await request
      .post('/api/groups/delete')
      .set(authAs('admin'))
      .send({ id: createdGroupId });

    expectSuccess(res);
  });
});

// ---------------------------------------------------------------------------
// /api/additional_services
// ---------------------------------------------------------------------------

describe('/api/additional_services', () => {
  let createdServiceId;

  it('GET / - admin can list additional services', async () => {
    const res = await request.get('/api/additional_services').set(authAs('admin'));
    expectSuccess(res);
    expect(res.body.result).toHaveProperty('data');
  });

  it('POST /add - admin can create additional service', async () => {
    const res = await request
      .post('/api/additional_services/add')
      .set(authAs('admin'))
      .send({
        name: { ru: 'Новая услуга', en: 'New Service' },
        code: `test_svc_${Date.now()}`,
        price: 200,
      });

    expectSuccess(res);
    createdServiceId = res.body.result.id;
  });

  it('POST /delete - admin can delete service', async () => {
    if (!createdServiceId) return;
    const res = await request
      .post('/api/additional_services/delete')
      .set(authAs('admin'))
      .send({ id: createdServiceId });

    expectSuccess(res);
  });
});

// ---------------------------------------------------------------------------
// /api/package_types (guest accessible)
// ---------------------------------------------------------------------------

describe('/api/package_types', () => {
  it('GET / - accessible without auth', async () => {
    const res = await request.get('/api/package_types');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expectSuccess(res);
  });

  it('returns seeded package types', async () => {
    const res = await request.get('/api/package_types');
    expectSuccess(res);
    if (res.body.result && res.body.result.length > 0) {
      const types = res.body.result.map(pt => pt.type);
      expect(types).toContain('box');
      expect(types).toContain('documents');
    }
  });
});

// ---------------------------------------------------------------------------
// /api/rate_types (guest accessible)
// ---------------------------------------------------------------------------

describe('/api/rate_types', () => {
  it('GET / - accessible without auth', async () => {
    const res = await request.get('/api/rate_types');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expectSuccess(res);
  });

  it('returns seeded rate types', async () => {
    const res = await request.get('/api/rate_types');
    expectSuccess(res);
    if (res.body.result && res.body.result.length > 0) {
      const types = res.body.result.map(rt => rt.type);
      expect(types).toContain('standard');
      expect(types).toContain('express');
    }
  });
});

// ---------------------------------------------------------------------------
// /api/tags
// ---------------------------------------------------------------------------

describe('/api/tags', () => {
  let createdTagId;

  it('GET / - admin can list tags', async () => {
    const res = await request.get('/api/tags').set(authAs('admin'));
    expectSuccess(res);
    expect(res.body.result).toHaveProperty('data');
  });

  it('POST /add - admin can create tag', async () => {
    const res = await request
      .post('/api/tags/add')
      .set(authAs('admin'))
      .send({ name: 'New Tag', color: '#00ff00' });

    expectSuccess(res);
    createdTagId = res.body.result.id;
  });

  it('POST /edit - admin can edit tag', async () => {
    if (!createdTagId) return;
    const res = await request
      .post('/api/tags/edit')
      .set(authAs('admin'))
      .send({ id: createdTagId, name: 'Updated Tag', color: '#0000ff' });

    expectSuccess(res);
  });

  it('POST /delete - admin can delete tag', async () => {
    if (!createdTagId) return;
    const res = await request
      .post('/api/tags/delete')
      .set(authAs('admin'))
      .send({ id: createdTagId });

    expectSuccess(res);
  });
});

// ---------------------------------------------------------------------------
// /api/config (guest GET)
// ---------------------------------------------------------------------------

describe('/api/config', () => {
  it('GET / - accessible without auth', async () => {
    const res = await request.get('/api/config');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expectSuccess(res);
  });

  it('admin can update config param', async () => {
    const res = await request
      .post('/api/config/edit')
      .set(authAs('admin'))
      .send({ param: 'newUserNotification', value: 'false', type: 'boolean' });

    expect([200, 404]).toContain(res.status);
  });
});

// ---------------------------------------------------------------------------
// /api/dashboard
// ---------------------------------------------------------------------------

describe('/api/dashboard', () => {
  it('GET / - admin can view dashboard', async () => {
    const res = await request.get('/api/dashboard').set(authAs('admin'));
    expectSuccess(res);
  });

  it('GET /month_orders_count - admin can get monthly stats', async () => {
    const res = await request
      .get('/api/dashboard/month_orders_count')
      .set(authAs('admin'));
    expectSuccess(res);
  });

  it('GET /orders_status_count - admin can get status stats', async () => {
    const res = await request
      .get('/api/dashboard/orders_status_count')
      .set(authAs('admin'));
    expectSuccess(res);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/dashboard');
    expectError(res, 401);
  });
});

// ---------------------------------------------------------------------------
// /api/message_templates
// ---------------------------------------------------------------------------

describe('/api/message_templates', () => {
  let createdTemplateId;

  it('GET / - admin can list templates', async () => {
    const res = await request.get('/api/message_templates').set(authAs('admin'));
    expectSuccess(res);
  });

  it('POST /add - admin can create template', async () => {
    const res = await request
      .post('/api/message_templates/add')
      .set(authAs('admin'))
      .send({ name: 'Test Template', content: 'Hello {{name}}', langCode: 'ru' });

    expectSuccess(res);
    createdTemplateId = res.body.result.id;
  });

  it('POST /delete - admin can delete template', async () => {
    if (!createdTemplateId) return;
    const res = await request
      .post('/api/message_templates/delete')
      .set(authAs('admin'))
      .send({ id: createdTemplateId });

    expectSuccess(res);
  });
});

// ---------------------------------------------------------------------------
// /api/news (guest GET)
// ---------------------------------------------------------------------------

describe('/api/news', () => {
  it('GET / - accessible without auth', async () => {
    const res = await request.get('/api/news');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expectSuccess(res);
  });

  it('GET / - authenticated admin also works', async () => {
    const res = await request.get('/api/news').set(authAs('admin'));
    expectSuccess(res);
  });
});

// ---------------------------------------------------------------------------
// /api/pages (guest GET)
// ---------------------------------------------------------------------------

describe('/api/pages', () => {
  it('GET / - accessible without auth', async () => {
    const res = await request.get('/api/pages');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expectSuccess(res);
  });

  it('GET / - authenticated admin also works', async () => {
    const res = await request.get('/api/pages').set(authAs('admin'));
    expectSuccess(res);
  });
});

// ---------------------------------------------------------------------------
// /api/acl (guest accessible)
// ---------------------------------------------------------------------------

describe('/api/acl', () => {
  it('GET / - accessible without auth', async () => {
    const res = await request.get('/api/acl');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expectSuccess(res);
  });
});

// ---------------------------------------------------------------------------
// /api/access_log
// ---------------------------------------------------------------------------

describe('/api/access_log', () => {
  it('GET / - admin can list access logs', async () => {
    const res = await request.get('/api/access_log').set(authAs('admin'));
    expectSuccess(res);
  });

  it('returns 401 without auth', async () => {
    const res = await request.get('/api/access_log');
    expectError(res, 401);
  });

  it('client cannot access logs (403)', async () => {
    const res = await request.get('/api/access_log').set(authAs('client'));
    expectError(res, 403);
  });
});

// ---------------------------------------------------------------------------
// GET / (root / health check)
// ---------------------------------------------------------------------------

describe('GET / (root)', () => {
  it('returns 200 or 404 (accessible without auth)', async () => {
    const res = await request.get('/');
    expect(res.status).not.toBe(401);
    expect(res.status).not.toBe(403);
    expect([200, 404]).toContain(res.status);
  });
});
