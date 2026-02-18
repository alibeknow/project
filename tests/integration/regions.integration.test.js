'use strict';

const { Region, Country, Sequelize } = require('../../models');

describe('Regions (Sequelize)', () => {
  const seeds = () => global.__TEST_SEEDS__;

  test('findAll returns seeded regions', async () => {
    const { count, rows } = await Region.findAndCountAll();
    expect(count).toBe(2);
  });

  test('findOne by id with Country', async () => {
    const obj = await Region.findOne({
      where: { id: seeds().regionMSKId },
      include: [{ model: Country }],
    });
    expect(obj).not.toBeNull();
    expect(obj.name.en).toBe('Moscow');
    expect(obj.Country.code).toBe('RU');
  });

  test('findAll by CountryId', async () => {
    const rows = await Region.findAll({ where: { CountryId: seeds().countryRUId } });
    expect(rows.length).toBe(1);
    expect(rows[0].name.en).toBe('Moscow');
  });

  test('create → update → delete', async () => {
    const created = await Region.create({
      name: { en: 'Saint Petersburg', ru: 'Санкт-Петербург' },
      CountryId: seeds().countryRUId,
      isShownInZone: true,
      isShownInSearch: true,
    });
    expect(created.id).toBeDefined();

    created.name = { en: 'SPb', ru: 'СПб' };
    await created.save();
    const updated = await Region.findByPk(created.id);
    expect(updated.name.en).toBe('SPb');

    await Region.destroy({ where: { id: created.id } });
    const gone = await Region.findByPk(created.id);
    expect(gone).toBeNull();
  });
});
