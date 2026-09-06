import test from 'node:test';
import assert from 'node:assert/strict';
import { ITEM_CATALOG, getEquippedClothes, hasRainResistantEquipment } from '../src/radiant/inventory.js';
import { ContextBuilder } from '../src/ai/context_builder.js';

test('equipped clothing with zero quantity no longer protects from rain or appears in the LLM outfit', () => {
    const inventory = [{
        item_id: 'trench_coat',
        item_type: 'clothes',
        quantity: 0,
        is_equipped: true,
        properties: { slot: 'outerwear', rain_resist: true }
    }];

    assert.equal(hasRainResistantEquipment(inventory), false);
    assert.equal(getEquippedClothes(inventory), null);
    assert.equal(ContextBuilder.describeOutfit(inventory).text, 'домашняя футболка');
});

test('catalog clothing has explicit slots for conflict-aware outfit changes', () => {
    assert.equal(ITEM_CATALOG.oversize_tshirt.properties.slot, 'top');
    assert.equal(ITEM_CATALOG.trench_coat.properties.slot, 'outerwear');
    assert.equal(ITEM_CATALOG.evening_dress.properties.slot, 'dress');
});

test('hasRainResistantEquipment recognizes rain_resist in equipped clothing or gear', () => {
    const inv = [
        { item_id: 'custom_parka', item_type: 'clothes', quantity: 1, is_equipped: true, properties: { slot: 'outerwear', rain_resist: true } },
        { item_id: 'tshirt', item_type: 'clothes', quantity: 1, is_equipped: true, properties: { slot: 'top', rain_resist: false } }
    ];
    assert.equal(hasRainResistantEquipment(inv), true);

    const invNoRain = [
        { item_id: 'tshirt', item_type: 'clothes', quantity: 1, is_equipped: true, properties: { slot: 'top', rain_resist: false } }
    ];
    assert.equal(hasRainResistantEquipment(invNoRain), false);
});

