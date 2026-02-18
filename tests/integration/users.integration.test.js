'use strict';

const bcrypt = require('bcrypt');
const { User, Group, UserGroup, Company, Sequelize } = require('../../models');

describe('Users (Sequelize)', () => {
  const seeds = () => global.__TEST_SEEDS__;

  test('findAll returns seeded users (9 active + 1 inactive)', async () => {
    const { count } = await User.findAndCountAll();
    expect(count).toBe(10);
  });

  test('findAll with Groups include', async () => {
    const rows = await User.findAll({
      include: [{ model: Group, through: { attributes: [] } }],
      limit: 1,
      where: { id: seeds().userIds.admin },
    });
    expect(rows.length).toBe(1);
    expect(rows[0].Groups).toBeDefined();
    expect(rows[0].Groups.length).toBe(1);
    expect(rows[0].Groups[0].name.en).toBe('Default');
  });

  test('findOne by id', async () => {
    const obj = await User.findByPk(seeds().userIds.admin);
    expect(obj).not.toBeNull();
    expect(obj.role).toBe('admin');
    expect(obj.isActive).toBe(true);
  });

  test('findOne by email', async () => {
    const obj = await User.findOne({ where: { email: 'test.admin@e2e.local' } });
    expect(obj).not.toBeNull();
    expect(obj.role).toBe('admin');
  });

  test('findOne by APIKey', async () => {
    const obj = await User.findOne({ where: { APIKey: 'e2e-api-key-admin-111111111111' } });
    expect(obj).not.toBeNull();
    expect(obj.role).toBe('admin');
  });

  test('create → attach group → update → delete', async () => {
    const created = await User.create({
      email: 'integration.new@e2e.local',
      password: 'Pass123!',
      role: 'client',
      firstName: 'New',
      lastName: 'User',
      isActive: true,
      isAPIActive: false,
      CompanyId: seeds().companyId,
    });
    expect(created.id).toBeDefined();
    expect(created.prettyName).toContain('New User');

    // Attach group
    await UserGroup.create({ UserId: created.id, GroupId: seeds().groupId });
    const withGroups = await User.findByPk(created.id, {
      include: [{ model: Group, through: { attributes: [] } }],
    });
    expect(withGroups.Groups.length).toBe(1);

    // Update
    created.firstName = 'Updated';
    await created.save();
    const updated = await User.findByPk(created.id);
    expect(updated.firstName).toBe('Updated');
    expect(updated.prettyName).toContain('Updated');

    // Delete
    await User.destroy({ where: { id: created.id } });
    const gone = await User.findByPk(created.id);
    expect(gone).toBeNull();
  });

  test('password is hashed via hooks', async () => {
    const user = await User.create({
      email: 'hash.test@e2e.local',
      password: 'plaintext123',
      role: 'client', firstName: 'Hash', lastName: 'Test',
      isActive: true, isAPIActive: false, CompanyId: seeds().companyId,
    });
    expect(user.password).not.toBe('plaintext123');
    const match = await bcrypt.compare('plaintext123', user.password);
    expect(match).toBe(true);

    await User.destroy({ where: { id: user.id } });
  });

  test('inactive user exists in seed data', async () => {
    const inactive = await User.findOne({ where: { email: 'test.inactive@e2e.local' } });
    expect(inactive).not.toBeNull();
    expect(inactive.isActive).toBe(false);
  });

  test('filter by CompanyId', async () => {
    const rows = await User.findAll({ where: { CompanyId: seeds().companyId } });
    expect(rows.length).toBe(10); // 9 roles + 1 inactive
    const rows2 = await User.findAll({ where: { CompanyId: seeds().company2Id } });
    expect(rows2.length).toBe(0);
  });
});
