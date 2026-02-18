'use strict';

const {
  Rate, RateRange, Zone, PackageType, RateType, Group,
  Sequelize,
} = require('../../models');

describe('Rates (Sequelize)', () => {
  const seeds = () => global.__TEST_SEEDS__;

  test('findAll returns seeded rate', async () => {
    const { count, rows } = await Rate.findAndCountAll();
    expect(count).toBe(1);
    expect(rows[0].name.en).toBe('Test Rate');
  });

  test('findAll with RateRanges include', async () => {
    const rows = await Rate.findAll({
      include: [{ model: RateRange }],
    });
    expect(rows.length).toBe(1);
    expect(rows[0].RateRanges).toBeDefined();
    expect(rows[0].RateRanges.length).toBe(1);
    expect(rows[0].RateRanges[0].weightFrom).toBe(0);
    expect(rows[0].RateRanges[0].weightTo).toBe(30);
    expect(rows[0].RateRanges[0].price).toBe(100);
  });

  test('findAll with Zone, PackageType, RateType, Group includes', async () => {
    const rows = await Rate.findAll({
      include: [
        { model: Zone },
        { model: PackageType },
        { model: RateType },
        { model: Group },
      ],
    });
    expect(rows.length).toBe(1);
    const rate = rows[0];
    expect(rate.Zone).toBeDefined();
    expect(rate.Zone.name.en).toBe('Test Zone');
    expect(rate.PackageType).toBeDefined();
    expect(rate.PackageType.type).toBe('box');
    expect(rate.RateType).toBeDefined();
    expect(rate.RateType.type).toBe('standard');
    expect(rate.Group).toBeDefined();
    expect(rate.Group.name.en).toBe('Default');
  });

  test('findOne by id', async () => {
    const obj = await Rate.findByPk(seeds().rateId, {
      include: [{ model: RateRange }],
    });
    expect(obj).not.toBeNull();
    expect(obj.name.en).toBe('Test Rate');
    expect(obj.ZoneId).toBe(seeds().zoneId);
    expect(obj.RateRanges.length).toBe(1);
  });

  test('create rate with ranges → update → delete', async () => {
    const rate = await Rate.create({
      name: { en: 'New Rate', ru: 'Новый тариф' },
      ZoneId: seeds().zoneId,
      PackageTypeId: seeds().pkgBoxId,
      RateTypeId: seeds().rtExpId,
      GroupId: seeds().groupId,
    });
    expect(rate.id).toBeDefined();

    await RateRange.create({
      RateId: rate.id, weightFrom: 0, weightTo: 10, price: 50, step: 1, pricePerStep: 5,
    });
    await RateRange.create({
      RateId: rate.id, weightFrom: 10, weightTo: 50, price: 200, step: 5, pricePerStep: 20,
    });

    const fetched = await Rate.findByPk(rate.id, { include: [{ model: RateRange }] });
    expect(fetched.RateRanges.length).toBe(2);

    // Update rate name
    rate.name = { en: 'Updated Rate', ru: 'Обновлённый' };
    await rate.save();
    const updated = await Rate.findByPk(rate.id);
    expect(updated.name.en).toBe('Updated Rate');

    // Delete — cascade removes ranges
    await Rate.destroy({ where: { id: rate.id } });
    const gone = await Rate.findByPk(rate.id);
    expect(gone).toBeNull();
    const ranges = await RateRange.findAll({ where: { RateId: rate.id } });
    expect(ranges.length).toBe(0);
  });

  test('bulk delete rates', async () => {
    const a = await Rate.create({
      name: { en: 'A' }, ZoneId: seeds().zoneId,
      PackageTypeId: seeds().pkgBoxId, RateTypeId: seeds().rtStdId, GroupId: seeds().groupId,
    });
    const b = await Rate.create({
      name: { en: 'B' }, ZoneId: seeds().zoneId,
      PackageTypeId: seeds().pkgDocsId, RateTypeId: seeds().rtStdId, GroupId: seeds().groupId,
    });
    const deleted = await Rate.destroy({
      where: { id: { [Sequelize.Op.in]: [a.id, b.id] } },
    });
    expect(deleted).toBe(2);
  });
});
