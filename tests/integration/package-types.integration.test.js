'use strict';

const { PackageType, Sequelize } = require('../../models');

describe('PackageTypes (Sequelize)', () => {
  const seeds = () => global.__TEST_SEEDS__;

  test('findAll returns seeded package types', async () => {
    const { count, rows } = await PackageType.findAndCountAll();
    expect(count).toBe(2);
    expect(rows.map(r => r.type).sort()).toEqual(['box', 'documents']);
  });

  test('findOne by id', async () => {
    const obj = await PackageType.findByPk(seeds().pkgBoxId);
    expect(obj).not.toBeNull();
    expect(obj.type).toBe('box');
    expect(obj.defaultWeight).toBe(1);
  });

  test('create → update → delete', async () => {
    const created = await PackageType.create({ type: 'pallet', defaultWeight: 100, defaultWidth: 120, defaultHeight: 100, defaultDepth: 80 });
    expect(created.id).toBeDefined();

    created.defaultWeight = 150;
    await created.save();
    const updated = await PackageType.findByPk(created.id);
    expect(updated.defaultWeight).toBe(150);

    await PackageType.destroy({ where: { id: created.id } });
    const gone = await PackageType.findByPk(created.id);
    expect(gone).toBeNull();
  });
});
