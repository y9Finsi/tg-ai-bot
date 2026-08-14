/**
 * RADIANT Plugin: spb_places
 * Поиск мест, заведений и локаций Санкт-Петербурга из карты мира Леры.
 */

import { LOCATIONS } from '../../world_map.js';

export const spbPlacesAction = {
    name: 'spb_places',
    title: 'Локации и заведения СПб',
    description: 'Поиск адресов, координат и типов конкретных заведений на карте Петербурга: где находится кофейня, бар, ресторан, парк или арт-пространство (Слой, Севкабель, Бертгольд). Для поиска событий и афиши используй web_search.',
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Название или тип места (например: Слой, Севкабель, кофе, бар, Петроградка)'
            }
        },
        required: ['query']
    },
    timeoutMs: 3000,
    config: {
        provider: 'world_map'
    },

    async execute(args = {}, context = {}) {
        const rawQuery = String(args.query || '').trim().toLowerCase();
        if (!rawQuery) {
            throw new Error('Поисковый запрос локации не может быть пустым');
        }

        const queryTokens = rawQuery.split(/\s+/).filter(w => w.length >= 3);
        const allLocations = Object.values(LOCATIONS);
        const matches = allLocations.filter(loc => {
            const name = (loc.name || '').toLowerCase();
            const shortName = (loc.short_name || '').toLowerCase();
            const district = (loc.district || '').toLowerCase();
            const type = (loc.type || '').toLowerCase();

            // Точное совпадение или совпадение по любому значащему слову запроса
            if (name.includes(rawQuery) || shortName.includes(rawQuery) || district.includes(rawQuery) || type.includes(rawQuery)) {
                return true;
            }
            return queryTokens.some(token => name.includes(token) || shortName.includes(token) || type.includes(token));
        });

        if (matches.length === 0) {
            return {
                status: 'success',
                data: {
                    text: `Место по запросу "${args.query}" не найдено на локальной карте Леры.`,
                    matches: []
                },
                meta: {
                    provider: 'world_map',
                    count: 0
                }
            };
        }

        const formatted = matches.map(loc => ({
            id: loc.id,
            name: loc.name,
            shortName: loc.short_name,
            district: loc.district,
            type: loc.type,
            coordinates: loc.coordinates
        }));

        const summaryText = formatted.map(loc => `• ${loc.name} (${loc.district}) — тип: ${loc.type}`).join('\n');

        return {
            status: 'success',
            data: {
                text: `Найдено на карте Питера (${formatted.length}):\n${summaryText}`,
                matches: formatted
            },
            meta: {
                provider: 'world_map',
                count: formatted.length
            }
        };
    }
};
