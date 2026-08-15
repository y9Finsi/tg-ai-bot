/**
 * RADIANT system action: search_archive_memory
 * Read-only поиск старых фактов конкретного пользователя.
 */

import { memoryRepository } from '../../../memory/memory_repository.js';

function normalizeUserId(value) {
    if (typeof value === 'number') {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new Error('Для поиска памяти нужен корректный numeric userId');
        }
        return value;
    }

    const normalized = String(value ?? '').trim();
    if (!/^\d+$/.test(normalized) || Number(normalized) <= 0 || !Number.isSafeInteger(Number(normalized))) {
        throw new Error('Для поиска памяти нужен корректный numeric userId');
    }
    return normalized;
}

function normalizeLimit(value) {
    if (value === undefined) return 8;
    const number = Number(value);
    if (!Number.isFinite(number)) return 8;
    return Math.min(20, Math.max(1, Math.trunc(number)));
}

function factText(fact) {
    return String(fact?.text ?? fact?.normalizedText ?? fact?.fact ?? '').trim();
}

export function createSearchArchiveMemoryAction({ repository = memoryRepository } = {}) {
    if (!repository || typeof repository.searchArchiveMemory !== 'function') {
        throw new TypeError('search_archive_memory requires a memory repository');
    }

    return {
        name: 'search_archive_memory',
        title: 'Поиск в архивной памяти',
        description: 'Поиск старых деталей о текущем пользователе по явному запросу «вспомни». Read-only, без изменения памяти.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Что нужно вспомнить'
                },
                limit: {
                    type: 'number',
                    description: 'Количество найденных фактов от 1 до 20'
                }
            },
            required: ['query']
        },
        timeoutMs: 2000,
        config: {
            provider: 'postgres_memory',
            cacheTtlSeconds: 0,
            method: 'POST'
        },

        async execute(args = {}, context = {}) {
            const userId = normalizeUserId(context.userId);
            const query = String(args.query ?? '').trim();
            if (!query) throw new Error('Поисковый запрос памяти не может быть пустым');

            const limit = normalizeLimit(args.limit);
            const facts = await repository.searchArchiveMemory({
                userId,
                query,
                limit,
                threshold: 0.2
            });
            const normalizedFacts = Array.isArray(facts) ? facts : [];
            const text = normalizedFacts.length > 0
                ? normalizedFacts.map((fact, index) => `${index + 1}. ${factText(fact)}`).filter(Boolean).join('\n')
                : 'В архивной памяти ничего подходящего не найдено.';

            return {
                status: 'success',
                data: {
                    text,
                    facts: normalizedFacts,
                    count: normalizedFacts.length
                },
                meta: {
                    provider: 'postgres_memory',
                    cached: false
                }
            };
        }
    };
}

export const searchArchiveMemoryAction = createSearchArchiveMemoryAction();
