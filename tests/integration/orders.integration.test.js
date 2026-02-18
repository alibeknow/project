'use strict';

const {
  Order, Package, OrderService, OrderTag, OrderHistory,
  OrderStatusHistory, OrderPaymentStatusHistory,
  Tag, User, Carrier, Country, Region, PackageType, RateType,
  Sequelize,
} = require('../../models');

describe('Orders (Sequelize)', () => {
  const seeds = () => global.__TEST_SEEDS__;

  test('findAll returns seeded order', async () => {
    const { count, rows } = await Order.findAndCountAll();
    expect(count).toBe(1);
    expect(rows[0].refNo).toBeDefined();
    expect(rows[0].orderStatus).toBe('pending');
  });

  test('findAll with includes (User, Carrier, Tags)', async () => {
    const rows = await Order.findAll({
      include: [
        { model: User, as: 'User' },
        { model: Carrier },
        { model: Tag, through: { attributes: [] } },
        { model: Country, as: 'CountryFrom' },
        { model: Country, as: 'CountryTo' },
        { model: PackageType },
        { model: RateType },
      ],
    });
    expect(rows.length).toBe(1);
    const order = rows[0];
    expect(order.User).toBeDefined();
    expect(order.User.role).toBe('client');
    expect(order.Carrier).toBeDefined();
    expect(order.Carrier.name.en).toBe('Test Carrier');
    expect(order.Tags).toBeDefined();
    expect(order.Tags.length).toBe(1);
    expect(order.PackageType).toBeDefined();
    expect(order.RateType).toBeDefined();
  });

  test('findOne with Packages', async () => {
    const order = await Order.findByPk(seeds().orderId, {
      include: [{ model: Package }],
    });
    expect(order).not.toBeNull();
    expect(order.Packages).toBeDefined();
    expect(order.Packages.length).toBe(1);
    expect(order.Packages[0].weight).toBe(1);
  });

  test('findAll filter by orderStatus', async () => {
    const rows = await Order.findAll({
      where: { orderStatus: 'pending' },
    });
    expect(rows.length).toBe(1);

    const rows2 = await Order.findAll({
      where: { orderStatus: 'delivered' },
    });
    expect(rows2.length).toBe(0);
  });

  test('findAll filter by UserId', async () => {
    const rows = await Order.findAll({
      where: { UserId: seeds().userIds.client },
    });
    expect(rows.length).toBe(1);

    const rows2 = await Order.findAll({
      where: { UserId: seeds().userIds.admin },
    });
    expect(rows2.length).toBe(0);
  });

  test('create order with packages and tags → delete', async () => {
    const order = await Order.create({
      refNo: 'INT-TEST-002',
      orderStatus: 'pending', paymentStatus: 'pending', paymentType: 'bankwire',
      declaredValue: 500, totalPrice: 200, companyPrice: 150, clientPrice: 200,
      contents: 'Test', externalComment: 'test', internalComment: '',
      pickupTime: new Date(Date.now() + 86400000), langCode: 'en',
      countryCodeFrom: 'RU', countryCodeTo: 'KZ',
      addressFrom: 'Test from', addressTo: 'Test to',
      UserId: seeds().userIds.client, CarrierId: seeds().carrierId,
      PackageTypeId: seeds().pkgBoxId, RateTypeId: seeds().rtStdId,
    });
    expect(order.id).toBeDefined();

    await Package.create({ weight: 2, width: 10, height: 10, depth: 10, quantity: 1, OrderId: order.id });
    await OrderTag.create({ OrderId: order.id, TagId: seeds().tagId });

    // Verify
    const fetched = await Order.findByPk(order.id, {
      include: [{ model: Package }, { model: Tag, through: { attributes: [] } }],
    });
    expect(fetched.Packages.length).toBe(1);
    expect(fetched.Tags.length).toBe(1);

    // Delete (cascade removes packages, tags, etc.)
    await Order.destroy({ where: { id: order.id } });
    const gone = await Order.findByPk(order.id);
    expect(gone).toBeNull();

    // Packages should be cascaded
    const pkgs = await Package.findAll({ where: { OrderId: order.id } });
    expect(pkgs.length).toBe(0);
  });

  test('update order status', async () => {
    const order = await Order.create({
      refNo: 'INT-TEST-003',
      orderStatus: 'pending', paymentStatus: 'pending', paymentType: 'bankwire',
      declaredValue: 100, totalPrice: 50, companyPrice: 40, clientPrice: 50,
      contents: 'Test', externalComment: '', internalComment: '',
      pickupTime: new Date(Date.now() + 86400000), langCode: 'en',
      countryCodeFrom: 'RU', countryCodeTo: 'KZ',
      addressFrom: 'Test', addressTo: 'Test',
      UserId: seeds().userIds.client, CarrierId: seeds().carrierId,
      PackageTypeId: seeds().pkgBoxId, RateTypeId: seeds().rtStdId,
    });

    order.orderStatus = 'processing';
    await order.save();

    const updated = await Order.findByPk(order.id);
    expect(updated.orderStatus).toBe('processing');

    // Clean up
    await Order.destroy({ where: { id: order.id } });
  });

  test('pagination with limit and offset', async () => {
    const { count, rows } = await Order.findAndCountAll({ limit: 10, offset: 0 });
    expect(count).toBe(1);
    expect(rows.length).toBe(1);

    const { count: count2, rows: rows2 } = await Order.findAndCountAll({ limit: 10, offset: 100 });
    expect(count2).toBe(1);
    expect(rows2.length).toBe(0);
  });
});
