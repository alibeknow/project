'use strict';

const { Tag, Sequelize } = require('../../models');

describe('Tags (Sequelize)', () => {
  const seeds = () => global.__TEST_SEEDS__;

  test('findAll returns seeded tags', async () => {
    const { count, rows } = await Tag.findAndCountAll();
    expect(count).toBe(2);
  });

  test('findOne by id', async () => {
    const obj = await Tag.findByPk(seeds().tagId);
    expect(obj).not.toBeNull();
    expect(obj.name.en).toBe('tag-1');
  });

  test('create → update → delete', async () => {
    const created = await Tag.create({ name: { en: 'new-tag', ru: 'новый-тег' } });
    expect(created.id).toBeDefined();

    created.name = { en: 'updated-tag', ru: 'обн-тег' };
    await created.save();
    const updated = await Tag.findByPk(created.id);
    expect(updated.name.en).toBe('updated-tag');

    await Tag.destroy({ where: { id: created.id } });
    const gone = await Tag.findByPk(created.id);
    expect(gone).toBeNull();
  });
});
