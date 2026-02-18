'use strict';

const { Country, Region, Sequelize } = require('../../models');

describe('Countries (Sequelize)', () => {
  const seeds = () => global.__TEST_SEEDS__;

  test('findAll returns seeded countries', async () => {
    const { count, rows } = await Country.findAndCountAll();
    expect(count).toBe(2);
    expect(rows.map(r => r.code).sort()).toEqual(['KZ', 'RU']);
  });

  test('findAll with Regions include (isShownInZone)', async () => {
    const rows = await Country.findAll({
      include: [{ model: Region, required: false, where: { isShownInZone: true } }],
    });
    expect(rows.length).toBe(2);
    const ru = rows.find(r => r.code === 'RU');
    expect(ru.Regions.length).toBe(1);
    expect(ru.Regions[0].name.en).toBe('Moscow');
  });

  test('findOne by id', async () => {
    const obj = await Country.findOne({ where: { id: seeds().countryRUId } });
    expect(obj).not.toBeNull();
    expect(obj.code).toBe('RU');
    expect(obj.name.en).toBe('Russia');
  });

  test('create → update → delete', async () => {
    const created = await Country.create({ code: 'us', name: { en: 'USA', ru: 'США' } });
    expect(created.id).toBeDefined();

    created.code = 'US';
    await created.save();
    const updated = await Country.findByPk(created.id);
    expect(updated.code).toBe('US');

    await Country.destroy({ where: { id: created.id } });
    const gone = await Country.findByPk(created.id);
    expect(gone).toBeNull();
  });

  test('bulk delete with array of ids', async () => {
    const a = await Country.create({ code: 'AA', name: { en: 'A' } });
    const b = await Country.create({ code: 'BB', name: { en: 'B' } });
    const deleted = await Country.destroy({ where: { id: { [Sequelize.Op.in]: [a.id, b.id] } } });
    expect(deleted).toBe(2);
  });
});
