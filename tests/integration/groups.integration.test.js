'use strict';

const { Group, GroupDiscount, GroupDiscountZone, Zone, Carrier, Sequelize } = require('../../models');

describe('Groups (Sequelize)', () => {
  const seeds = () => global.__TEST_SEEDS__;

  test('findAll returns seeded group', async () => {
    const { count, rows } = await Group.findAndCountAll();
    expect(count).toBe(1);
    expect(rows[0].name.en).toBe('Default');
    expect(rows[0].isDefault).toBe(true);
  });

  test('findAll with GroupDiscounts → Zones include', async () => {
    const rows = await Group.findAll({
      include: [{
        model: GroupDiscount,
        include: [{ model: Zone, as: 'Zones', through: { attributes: [] } }],
      }],
    });
    expect(rows.length).toBe(1);
    expect(rows[0].GroupDiscounts).toBeDefined();
    expect(Array.isArray(rows[0].GroupDiscounts)).toBe(true);
  });

  test('findOne by id', async () => {
    const obj = await Group.findByPk(seeds().groupId);
    expect(obj).not.toBeNull();
    expect(obj.name.en).toBe('Default');
    expect(obj.isDefault).toBe(true);
  });

  test('create → update → delete', async () => {
    const created = await Group.create({
      name: { en: 'Test Group', ru: 'Тест Группа' },
      isDefault: false, discount: 10,
    });
    expect(created.id).toBeDefined();

    created.discount = 15;
    await created.save();
    const updated = await Group.findByPk(created.id);
    expect(updated.discount).toBe(15);

    await Group.destroy({ where: { id: created.id } });
    const gone = await Group.findByPk(created.id);
    expect(gone).toBeNull();
  });

  test('create group with discount and zone binding', async () => {
    const group = await Group.create({
      name: { en: 'Discount Group', ru: 'Группа скидок' },
      isDefault: false, discount: 5,
    });

    const discount = await GroupDiscount.create({
      discount: 10,
      GroupId: group.id,
      CarrierId: seeds().carrierId,
    });

    await GroupDiscountZone.create({
      GroupDiscountId: discount.id,
      ZoneId: seeds().zoneId,
    });

    // Verify include chain
    const fetched = await Group.findByPk(group.id, {
      include: [{
        model: GroupDiscount,
        include: [{ model: Zone, as: 'Zones', through: { attributes: [] } }],
      }],
    });
    expect(fetched.GroupDiscounts.length).toBe(1);
    expect(fetched.GroupDiscounts[0].discount).toBe(10);
    expect(fetched.GroupDiscounts[0].Zones.length).toBe(1);
    expect(fetched.GroupDiscounts[0].Zones[0].id).toBe(seeds().zoneId);

    // Clean up (cascade should handle GroupDiscount + zone binding)
    await Group.destroy({ where: { id: group.id } });
  });
});
