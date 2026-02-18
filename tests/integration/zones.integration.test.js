'use strict';

const {
  Zone, ZoneRegionFrom, ZoneRegionTo, ZoneAdditionalService,
  Region, Country, AdditionalService, Carrier, Sequelize,
} = require('../../models');

describe('Zones (Sequelize)', () => {
  const seeds = () => global.__TEST_SEEDS__;

  test('findAll returns seeded zone', async () => {
    const { count, rows } = await Zone.findAndCountAll();
    expect(count).toBe(1);
    expect(rows[0].name.en).toBe('Test Zone');
  });

  test('findAll with RegionsFrom, RegionsTo, AdditionalServices', async () => {
    const rows = await Zone.findAll({
      include: [
        { model: Region, as: 'RegionsFrom', through: { attributes: [] }, include: [{ model: Country }] },
        { model: Region, as: 'RegionsTo', through: { attributes: [] }, include: [{ model: Country }] },
        { model: AdditionalService, as: 'AdditionalServices', through: { attributes: [] } },
      ],
    });
    expect(rows.length).toBe(1);
    const zone = rows[0];
    expect(zone.RegionsFrom.length).toBe(1);
    expect(zone.RegionsFrom[0].name.en).toBe('Moscow');
    expect(zone.RegionsFrom[0].Country.code).toBe('RU');
    expect(zone.RegionsTo.length).toBe(1);
    expect(zone.RegionsTo[0].name.en).toBe('Almaty');
    expect(zone.AdditionalServices.length).toBe(1);
    expect(zone.AdditionalServices[0].code).toBe('insurance');
  });

  test('findOne by id', async () => {
    const obj = await Zone.findByPk(seeds().zoneId);
    expect(obj).not.toBeNull();
    expect(obj.name.en).toBe('Test Zone');
    expect(obj.CarrierId).toBe(seeds().carrierId);
  });

  test('create with region bindings → delete (cascade)', async () => {
    const zone = await Zone.create({
      name: { en: 'New Zone', ru: 'Новая Зона' },
      CarrierId: seeds().carrierId,
    });
    expect(zone.id).toBeDefined();

    await ZoneRegionFrom.create({ ZoneId: zone.id, RegionId: seeds().regionMSKId });
    await ZoneRegionTo.create({ ZoneId: zone.id, RegionId: seeds().regionALMId });
    await ZoneAdditionalService.create({ ZoneId: zone.id, AdditionalServiceId: seeds().svcId });

    // Verify
    const fetched = await Zone.findByPk(zone.id, {
      include: [
        { model: Region, as: 'RegionsFrom', through: { attributes: [] } },
        { model: Region, as: 'RegionsTo', through: { attributes: [] } },
        { model: AdditionalService, as: 'AdditionalServices', through: { attributes: [] } },
      ],
    });
    expect(fetched.RegionsFrom.length).toBe(1);
    expect(fetched.RegionsTo.length).toBe(1);
    expect(fetched.AdditionalServices.length).toBe(1);

    await Zone.destroy({ where: { id: zone.id } });
    const gone = await Zone.findByPk(zone.id);
    expect(gone).toBeNull();
  });

  test('update zone name', async () => {
    const zone = await Zone.create({
      name: { en: 'Updatable Zone', ru: 'Обновляемая' },
      CarrierId: seeds().carrierId,
    });
    zone.name = { en: 'Updated Zone', ru: 'Обновлённая' };
    await zone.save();
    const refreshed = await Zone.findByPk(zone.id);
    expect(refreshed.name.en).toBe('Updated Zone');

    await Zone.destroy({ where: { id: zone.id } });
  });
});
