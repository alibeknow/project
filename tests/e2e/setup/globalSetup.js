'use strict';

const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const fs   = require('fs');
const path = require('path');
const bcrypt = require('bcrypt');

const CONFIG_FILE = path.join(__dirname, '.testdb.json');

// Fixed API keys per role — stable across all test runs
const API_KEYS = {
  admin:           'e2e-api-key-admin-111111111111',
  supervisor:      'e2e-api-key-supervisor-2222222',
  manager:         'e2e-api-key-manager-33333333333',
  company_manager: 'e2e-api-key-comp-mgr-44444444',
  operator:        'e2e-api-key-operator-555555555',
  sales_manager:   'e2e-api-key-sales-mgr-6666666',
  sales:           'e2e-api-key-sales-7777777777777',
  carrier_manager: 'e2e-api-key-carrier-mgr-888888',
  client:          'e2e-api-key-client-999999999999',
};

module.exports = async function globalSetup() {
  console.log('\n[E2E globalSetup] Starting...');

  // ── 1. Start PostgreSQL ─────────────────────────────────────────────────
  let host, port, database, username, password;

  try {
    const container = await new PostgreSqlContainer('postgres:15-alpine')
      .withDatabase('bs_test')
      .withUsername('bs_test_user')
      .withPassword('bs_test_pass')
      .withStartupTimeout(120_000)
      .start();

    host     = container.getHost();
    port     = container.getPort();
    database = container.getDatabase();
    username = container.getUsername();
    password = container.getPassword();

    global.__PG_CONTAINER__ = container;
    console.log(`[E2E globalSetup] PostgreSQL ready at ${host}:${port}/${database}`);
  } catch (err) {
    console.warn('[E2E globalSetup] testcontainers unavailable, using env-based local PostgreSQL:', err.message);
    host     = process.env.DB_TEST_HOST     || 'localhost';
    port     = parseInt(process.env.DB_TEST_PORT || '5432', 10);
    database = process.env.DB_TEST_NAME     || 'bs_test';
    username = process.env.DB_TEST_USERNAME || 'postgres';
    password = process.env.DB_TEST_PASSWORD || 'postgres';
  }

  // ── 2. Set env vars in THIS process before requiring app modules ────────
  process.env.NODE_ENV    = 'test';
  process.env.DB_HOSTNAME = host;
  process.env.DB_PORT     = String(port);
  process.env.DB_NAME     = database;
  process.env.DB_USERNAME = username;
  process.env.DB_PASSWORD = password;

  // ── 3. Sync schema ───────────────────────────────────────────────────────
  const { sequelize } = require('../../../models');
  await sequelize.sync({ force: true });
  console.log('[E2E globalSetup] Schema synced.');

  // ── 4. Seed test data ────────────────────────────────────────────────────
  const seeds = await seedTestData(sequelize, API_KEYS);
  console.log('[E2E globalSetup] Seed data ready.');

  // ── 5. Persist connection info + seeds + API keys for test workers ───────
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({
    host, port, database, username, password,
    API_KEYS,
    seeds,
  }, null, 2), 'utf-8');

  await sequelize.close();
  console.log('[E2E globalSetup] Done.\n');
};

// ---------------------------------------------------------------------------

async function seedTestData(sequelize, API_KEYS) {
  const models = require('../../../models');
  // 4 bcrypt rounds — fast enough for tests, real hashing (not mocked)
  const passwordHash = await bcrypt.hash('TestPassword123!', 4);

  let ids = {};

  await sequelize.transaction(async (t) => {
    // Companies
    const company  = await models.Company.create({ name: { ru: 'Test Company',    en: 'Test Company'    }, isPrimary: true  }, { transaction: t });
    const company2 = await models.Company.create({ name: { ru: 'Second Company',  en: 'Second Company'  }, isPrimary: false }, { transaction: t });

    // Default group
    const group = await models.Group.create({ name: { ru: 'Default', en: 'Default' }, isDefault: true }, { transaction: t });

    // Users for every role
    const userIds = {};
    for (const [role, apiKey] of Object.entries(API_KEYS)) {
      const email = `test.${role.replace('_', '.')}@e2e.local`;
      const u = await models.User.create({
        email,
        password:    passwordHash,
        role,
        firstName:   role.charAt(0).toUpperCase() + role.slice(1),
        lastName:    'Test',
        isActive:    true,
        isAPIActive: true,
        APIKey:      apiKey,
        CompanyId:   company.id,
      }, { transaction: t, hooks: false });
      await models.UserGroup.create({ UserId: u.id, GroupId: group.id }, { transaction: t });
      userIds[role] = u.id;
    }

    // Inactive user
    await models.User.create({
      email: 'test.inactive@e2e.local', password: passwordHash,
      role: 'client', firstName: 'Inactive', lastName: 'User',
      isActive: false, isAPIActive: false,
      APIKey: 'e2e-api-key-inactive-000000000000',
      CompanyId: company.id,
    }, { transaction: t, hooks: false });

    // Countries
    const countryRU = await models.Country.create({ code: 'RU', name: { ru: 'Россия',    en: 'Russia'      } }, { transaction: t });
    const countryKZ = await models.Country.create({ code: 'KZ', name: { ru: 'Казахстан', en: 'Kazakhstan'  } }, { transaction: t });

    // Regions
    const regionMSK = await models.Region.create({ code: 'MSK', name: { ru: 'Москва', en: 'Moscow' }, CountryId: countryRU.id }, { transaction: t });
    const regionALM = await models.Region.create({ code: 'ALM', name: { ru: 'Алматы', en: 'Almaty' }, CountryId: countryKZ.id }, { transaction: t });

    // Package types
    const pkgBox  = await models.PackageType.create({ type: 'box',       defaultWeight: 1,   defaultWidth: 20, defaultHeight: 20, defaultDepth: 20 }, { transaction: t });
    const pkgDocs = await models.PackageType.create({ type: 'documents', defaultWeight: 0.5, defaultWidth: 30, defaultHeight: 21, defaultDepth: 1  }, { transaction: t });

    // Rate types
    const rtStd = await models.RateType.create({ type: 'standard', name: { ru: 'Стандарт', en: 'Standard' } }, { transaction: t });
    const rtExp = await models.RateType.create({ type: 'express',  name: { ru: 'Экспресс', en: 'Express'  } }, { transaction: t });

    // Carrier (no external API)
    const carrier = await models.Carrier.create({
      name: { ru: 'Тестовый перевозчик', en: 'Test Carrier' },
      api: 'none', isActive: true,
      fuelTax: 0, insuranceIncluded: 0, insurancePercentage: 0,
      isRateByCarrierApi: false, isVATIncluded: false, isFuelTaxIncluded: false,
    }, { transaction: t });

    // Zone + region bindings
    const zone = await models.Zone.create({ name: { ru: 'Тест Зона', en: 'Test Zone' }, CarrierId: carrier.id }, { transaction: t });
    await models.ZoneRegionFrom.create({ ZoneId: zone.id, RegionId: regionMSK.id }, { transaction: t });
    await models.ZoneRegionTo.create(  { ZoneId: zone.id, RegionId: regionALM.id }, { transaction: t });

    // Rate
    const rate = await models.Rate.create({
      name: 'Test Standard Rate',
      ZoneId: zone.id, RateTypeId: rtStd.id, PackageTypeId: pkgBox.id,
    }, { transaction: t });

    // Additional service
    const svc = await models.AdditionalService.create(
      { name: { ru: 'Страховка', en: 'Insurance' }, code: 'insurance', calcType: 'fixed_price', action: 'insurance' },
      { transaction: t }
    );

    // Tag
    const tag = await models.Tag.create({ name: 'e2e-tag', color: '#ff0000' }, { transaction: t });

    // ConfigParam — disable email notifications so register doesn't try to send to admin
    await models.ConfigParam.create({ param: 'newUserNotification', value: 'false', type: 'boolean' }, { transaction: t });

    // Seed order for client
    const order = await models.Order.create({
      refNo: 'E2E-ORDER-001',
      orderStatus: 'pending', paymentStatus: 'pending', paymentType: 'bankwire',
      declaredValue: 1000, totalPrice: 500, companyPrice: 400, clientPrice: 500,
      contents: 'Test package', externalComment: 'E2E test', internalComment: '',
      pickupTime: new Date(Date.now() + 86400000), langCode: 'ru',
      countryCodeFrom: 'RU', countryCodeTo: 'KZ',
      addressFrom: 'Москва, Тверская, 1',
      addressDetailsFrom: { city: 'Москва', province: '', addressLine1: 'Тверская, 1', phone: '+79001234567', email: 'sender@e2e.local', firstName: 'Иван', lastName: 'Иванов', countryCode: 'RU' },
      addressTo: 'Алматы, Абая, 1',
      addressDetailsTo: { city: 'Алматы', province: '', addressLine1: 'Абая, 1', phone: '+77771234567', email: 'recipient@e2e.local', firstName: 'Алибек', lastName: 'Алибеков', countryCode: 'KZ' },
      UserId: userIds.client, CarrierId: carrier.id,
      PackageTypeId: pkgBox.id, RateTypeId: rtStd.id, CompanyId: company.id,
    }, { transaction: t });

    await models.Package.create({
      weight: 1, width: 20, height: 20, depth: 20, quantity: 1,
      price: { calcWeight: 1 }, OrderId: order.id,
    }, { transaction: t });

    ids = {
      companyId:   company.id,  company2Id:  company2.id,
      groupId:     group.id,    orderId:     order.id,
      carrierId:   carrier.id,  countryRUId: countryRU.id,
      countryKZId: countryKZ.id,regionMSKId: regionMSK.id,
      regionALMId: regionALM.id,pkgBoxId:    pkgBox.id,
      pkgDocsId:   pkgDocs.id,  rtStdId:     rtStd.id,
      rtExpId:     rtExp.id,    zoneId:      zone.id,
      rateId:      rate.id,     tagId:       tag.id,
      svcId:       svc.id,      userIds,
    };
  });

  return ids;
}
