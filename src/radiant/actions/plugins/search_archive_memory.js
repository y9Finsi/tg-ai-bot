/**
 * RADIANT system action: search_archive_memory
 * Read-only поиск старых фактов конкретного пользователя.
 */

import { memoryRepository } from '../../../memory/memory_repository.js';
import { createSemanticaClient } from '../../../memory/semantica_client.js';

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
    return String(fact?.text ?? fact?.normalizedText ?? fact?.fact ?? fact?.content ?? '').trim();
}

function dedupeFacts(facts) {
    const seen = new Set();
    const result = [];
    for (const fact of facts) {
        const text = factText(fact);
        const key = text.toLowerCase();
        if (!text || seen.has(key)) continue;
        seen.add(key);
        result.push(fact);
    }
    return result;
}

export function createSearchArchiveMemoryAction({
    repository = memoryRepository,
    semanticaClient = createSemanticaClient()
} = {}) {
    if (!repository || typeof repository.searchArchiveMemory !== 'function') {
        throw new TypeError('search_archive_memory requires a memory repository');
    }

    return {
        name: 'search_archive_memory',
        title: 'Поиск в графе памяти и воспоминаниях',
        description: 'Поиск прошлых фактов, обещаний, разговоров и договорённостей с пользователем в Семантике и базе данных. Вызывай ОБЯЗАТЕЛЬНО, когда пользователь утверждает, что ты что-то говорила/обещала («ты говорила про гольф», «ты обещала в бар», «помнишь мы обсуждали...»), или когда нужно проверить детали прошлого.',
        inputSchema: {
            type: 'object',
            properties: {
                query: {
                    type: 'string',
                    description: 'Что именно нужно найти или проверить в памяти (например: «гольф», «уборка в саду», «обещание пойти в бар»)'
                },
                limit: {
                    type: 'number',
                    description: 'Количество фактов от 1 до 20 (по умолчанию 8)'
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

            // 1. Поиск в графе Semantica (если доступен)
            let semanticaFacts = [];
            if (semanticaClient && typeof semanticaClient.searchMemory === 'function') {
                try {
                    const semRes = await semanticaClient.searchMemory({
                        userId,
                        query,
                        limit,
                        threshold: 0.3
                    });
                    if (Array.isArray(semRes)) {
                        semanticaFacts = semRes;
                    }
                } catch {
                    // Semantica error/timeout fallback
                }
            }

            // 2. Поиск в Postgres memory repository
            let repoFacts = [];
            try {
                const facts = await repository.searchArchiveMemory({
                    userId,
                    query,
                    limit,
                    threshold: 0.2
                });
                if (Array.isArray(facts)) {
                    repoFacts = facts;
                }
            } catch {
                // Repository fallback
            }

            const combined = dedupeFacts([...semanticaFacts, ...repoFacts]).slice(0, limit);
            const text = combined.length > 0
                ? `Найденные подтверждённые факты в памяти по запросу «${query}»:\n` +
                  combined.map((fact, index) => `${index + 1}. ${factText(fact)}`).filter(Boolean).join('\n')
                : `В графе памяти и истории НИЧЕГО не найдено по запросу «${query}».\nЛера этого НЕ говорила, НЕ обещала и НЕ обсуждала с пользователем.\nКАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО соглашаться с утверждением пользователя или выкручиваться («я имела в виду другое»). Ответь прямо: ты этого не говорила и вы об этом не договаривались.`;

            return {
                status: 'success',
                data: {
                    text,
                    facts: combined,
                    count: combined.length
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

