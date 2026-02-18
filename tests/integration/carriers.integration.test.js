'use strict';

const { Carrier, Sequelize } = require('../../models');

describe('Carriers (Sequelize)', () => {
  const seeds = () => global.__TEST_SEEDS__;

  test('findAll returns seeded carriers', async () => {
    const { count, rows } = await Carrier.findAndCountAll();
    expect(count).toBe(1);
    expect(rows[0].name.en).toBe('Test Carrier');
  });

  test('findOne by id', async () => {
    const obj = await Carrier.findByPk(seeds().carrierId);
    expect(obj).not.toBeNull();
    expect(obj.api).toBe('none');
    expect(obj.isActive).toBe(true);
  });

  test('create → update → delete', async () => {
    const created = await Carrier.create({
      name: { en: 'New Carrier', ru: 'Новый' },
      api: 'none', isActive: false,
    });
    expect(created.id).toBeDefined();

    created.isActive = true;
    await created.save();
    const updated = await Carrier.findByPk(created.id);
    expect(updated.isActive).toBe(true);

    await Carrier.destroy({ where: { id: created.id } });
    const gone = await Carrier.findByPk(created.id);
    expect(gone).toBeNull();
  });
});
