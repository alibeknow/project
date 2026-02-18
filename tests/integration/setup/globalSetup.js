'use strict';

const { PostgreSqlContainer } = require('@testcontainers/postgresql');
const fs     = require('fs');
const path   = require('path');
const bcrypt = require('bcrypt');

const CONFIG_FILE = path.join(__dirname, '.testdb.json');

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
  console.log('\n[Integration globalSetup] Starting...');

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
    console.log(`[Integration globalSetup] PostgreSQL ready at ${host}:${port}/${database}`);
  } catch (err) {
    console.warn('[Integration globalSetup] testcontainers unavailable:', err.message);
    host     = process.env.DB_TEST_HOST     || 'localhost';
    port     = parseInt(process.env.DB_TEST_PORT || '5432', 10);
    database = process.env.DB_TEST_NAME     || 'bs_test';
    username = process.env.DB_TEST_USERNAME || 'postgres';
    password = process.env.DB_TEST_PASSWORD || 'postgres';
  }

  process.env.NODE_ENV    = 'test';
  process.env.DB_HOSTNAME = host;
  process.env.DB_PORT     = String(port);
  process.env.DB_NAME     = database;
  process.env.DB_USERNAME = username;
  process.env.DB_PASSWORD = password;

  const { sequelize } = require('../../../models');
  await sequelize.sync({ force: true });
  console.log('[Integration globalSetup] Schema synced.');

  const seeds = await seedTestData(sequelize, API_KEYS);
  console.log('[Integration globalSetup] Seed data ready.');

  fs.writeFileSync(CONFIG_FILE, JSON.stringify({
    host, port, database, username, password,
    API_KEYS, seeds,
  }, null, 2), 'utf-8');

  await sequelize.close();
  console.log('[Integration globalSetup] Done.\n');
};

// ---------------------------------------------------------------------------

async function seedTestData(sequelize, API_KEYS) {
  const models = require('../../../models');
  const passwordHash = await bcrypt.hash('TestPassword123!', 4);
  let ids = {};

  await sequelize.transaction(async (t) => {
    const company  = await models.Company.create({ name: { ru: 'Test Company', en: 'Test Company' }, isPrimary: true }, { transaction: t });
    const company2 = await models.Company.create({ name: { ru: 'Second Company', en: 'Second Company' }, isPrimary: false }, { transaction: t });

    const group = await models.Group.create({ name: { ru: 'Default', en: 'Default' }, isDefault: true, discount: 0 }, { transaction: t });

    const userIds = {};
    for (const [role, apiKey] of Object.entries(API_KEYS)) {
      const email = `test.${role.replace('_', '.')}@e2e.local`;
      const u = await models.User.create({
        email, password: passwordHash, role,
        firstName: role.charAt(0).toUpperCase() + role.slice(1),
        lastName: 'Test', isActive: true, isAPIActive: true,
        APIKey: apiKey, CompanyId: company.id,
      }, { transaction: t, hooks: false });
      await models.UserGroup.create({ UserId: u.id, GroupId: group.id }, { transaction: t });
      userIds[role] = u.id;
    }

    await models.User.create({
      email: 'test.inactive@e2e.local', password: passwordHash,
      role: 'client', firstName: 'Inactive', lastName: 'User',
      isActive: false, isAPIActive: false,
      APIKey: 'e2e-api-key-inactive-000000000000', CompanyId: company.id,
    }, { transaction: t, hooks: false });

    const countryRU = await models.Country.create({ code: 'RU', name: { ru: 'Россия', en: 'Russia' } }, { transaction: t });
    const countryKZ = await models.Country.create({ code: 'KZ', name: { ru: 'Казахстан', en: 'Kazakhstan' } }, { transaction: t });

    const regionMSK = await models.Region.create({ name: { ru: 'Москва', en: 'Moscow' }, CountryId: countryRU.id, isShownInZone: true, isShownInSearch: true }, { transaction: t });
    const regionALM = await models.Region.create({ name: { ru: 'Алматы', en: 'Almaty' }, CountryId: countryKZ.id, isShownInZone: true, isShownInSearch: true }, { transaction: t });

    const pkgBox  = await models.PackageType.create({ type: 'box', defaultWeight: 1, defaultWidth: 20, defaultHeight: 20, defaultDepth: 20 }, { transaction: t });
    const pkgDocs = await models.PackageType.create({ type: 'documents', defaultWeight: 0.5, defaultWidth: 30, defaultHeight: 21, defaultDepth: 1 }, { transaction: t });

    const rtStd = await models.RateType.create({ type: 'standard' }, { transaction: t });
    const rtExp = await models.RateType.create({ type: 'express' }, { transaction: t });

    const carrier = await models.Carrier.create({
      name: { ru: 'Тестовый перевозчик', en: 'Test Carrier' },
      api: 'none', isActive: true, fuelTax: 0,
      insuranceIncluded: 0, insurancePercentage: 0,
      isRateByCarrierApi: false, isVATIncluded: false, isFuelTaxIncluded: false,
    }, { transaction: t });

    const zone = await models.Zone.create({ name: { ru: 'Тест Зона', en: 'Test Zone' }, CarrierId: carrier.id }, { transaction: t });
    await models.ZoneRegionFrom.create({ ZoneId: zone.id, RegionId: regionMSK.id }, { transaction: t });
    await models.ZoneRegionTo.create({ ZoneId: zone.id, RegionId: regionALM.id }, { transaction: t });

    const svc = await models.AdditionalService.create(
      { name: { ru: 'Страховка', en: 'Insurance' }, code: 'insurance', calcType: 'fixed_price', action: 'insurance', CarrierId: carrier.id },
      { transaction: t }
    );
    await models.ZoneAdditionalService.create({ ZoneId: zone.id, AdditionalServiceId: svc.id }, { transaction: t });

    const rate = await models.Rate.create({
      name: { ru: 'Тестовый тариф', en: 'Test Rate' },
      ZoneId: zone.id, RateTypeId: rtStd.id, PackageTypeId: pkgBox.id, GroupId: group.id,
    }, { transaction: t });

    await models.RateRange.create({
      RateId: rate.id, weightFrom: 0, weightTo: 30, price: 100, step: 1, pricePerStep: 10,
    }, { transaction: t });

    await models.RateParam.create({
      CarrierId: carrier.id, PackageTypeId: pkgBox.id, RateTypeId: rtStd.id,
    }, { transaction: t });

    const tag  = await models.Tag.create({ name: { ru: 'тег-1', en: 'tag-1' } }, { transaction: t });
    const tag2 = await models.Tag.create({ name: { ru: 'тег-2', en: 'tag-2' } }, { transaction: t });

    await models.ConfigParam.create({ param: 'phone', value: '+7 777 777 7777' }, { transaction: t });
    await models.ConfigParam.create({ param: 'email', value: 'robot@bestsender.kz' }, { transaction: t });
    await models.ConfigParam.create({ param: 'precision', value: '2' }, { transaction: t });

    await models.MessageTemplate.create({ name: 'Welcome', text: 'Hello {{name}}', order: 1 }, { transaction: t });

    const order = await models.Order.create({
      refNo: 'INT-ORDER-001',
      orderStatus: 'pending', paymentStatus: 'pending', paymentType: 'bankwire',
      declaredValue: 1000, totalPrice: 500, companyPrice: 400, clientPrice: 500,
      contents: 'Test package', externalComment: 'Integration test', internalComment: '',
      pickupTime: new Date(Date.now() + 86400000), langCode: 'ru',
      countryCodeFrom: 'RU', countryCodeTo: 'KZ',
      addressFrom: 'Москва, Тверская, 1',
      addressDetailsFrom: { city: 'Москва', province: '', addressLine1: 'Тверская, 1', phone: '+79001234567', email: 'sender@test.local', firstName: 'Иван', lastName: 'Иванов', countryCode: 'RU' },
      addressTo: 'Алматы, Абая, 1',
      addressDetailsTo: { city: 'Алматы', province: '', addressLine1: 'Абая, 1', phone: '+77771234567', email: 'recipient@test.local', firstName: 'Алибек', lastName: 'Алибеков', countryCode: 'KZ' },
      UserId: userIds.client, CarrierId: carrier.id,
      PackageTypeId: pkgBox.id, RateTypeId: rtStd.id,
    }, { transaction: t });

    await models.Package.create({ weight: 1, width: 20, height: 20, depth: 20, quantity: 1, OrderId: order.id }, { transaction: t });
    await models.OrderTag.create({ OrderId: order.id, TagId: tag.id }, { transaction: t });

    ids = {
      companyId: company.id, company2Id: company2.id,
      groupId: group.id, orderId: order.id,
      carrierId: carrier.id, countryRUId: countryRU.id, countryKZId: countryKZ.id,
      regionMSKId: regionMSK.id, regionALMId: regionALM.id,
      pkgBoxId: pkgBox.id, pkgDocsId: pkgDocs.id,
      rtStdId: rtStd.id, rtExpId: rtExp.id,
      zoneId: zone.id, rateId: rate.id,
      tagId: tag.id, tag2Id: tag2.id, svcId: svc.id,
      userIds,
    };
  });

  return ids;
}
