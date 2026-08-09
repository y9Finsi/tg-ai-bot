/**
 * Smart Inventory System for Radiant LERA Engine
 */

export const ITEM_CATALOG = {
    oversize_tshirt: {
        id: 'oversize_tshirt',
        name: 'Футболка Богдана',
        type: 'clothes',
        properties: { slot: 'top', warmth: 10, rain_resist: false, location_type: 'home' }
    },
    trench_coat: {
        id: 'trench_coat',
        name: 'Питерский тренч',
        type: 'clothes',
        properties: { slot: 'outerwear', warmth: 25, rain_resist: true, location_type: 'street' }
    },
    evening_dress: {
        id: 'evening_dress',
        name: 'Вечернее черное платье',
        type: 'clothes',
        properties: { slot: 'dress', warmth: 15, rain_resist: false, location_type: 'bar' }
    },
    cheese_ramen: {
        id: 'cheese_ramen',
        name: 'Сырный Рамен',
        type: 'food',
        properties: { hunger_restore: 50, mood_boost: 10 }
    },
    poke_bowl: {
        id: 'poke_bowl',
        name: 'Поке с лососем из ВкусВилла',
        type: 'food',
        properties: { hunger_restore: 65, mood_boost: 15 }
    },
    satisfyer: {
        id: 'satisfyer',
        name: 'Satisfyer Pro 2',
        type: 'toy',
        properties: { horny_restore: 80, fatigue_add: 15 }
    }
};

/**
 * Checks if inventory contains a valid item of a given type or specific item_id.
 */
export function hasItemType(inventoryItems, itemType) {
    return inventoryItems.some(i => i.item_type === itemType && i.quantity > 0);
}

/**
 * Retrieves the equipped clothing item or null.
 */
export function getEquippedClothes(inventoryItems) {
    return inventoryItems.find(i => i.item_type === 'clothes' && i.is_equipped && i.quantity > 0) || null;
}

export function hasRainResistantEquipment(inventoryItems = []) {
    return inventoryItems.some(item => item.item_type === 'clothes' && item.is_equipped && item.quantity > 0 && item.properties?.rain_resist === true);
}
