/**
 * RADIANT Plugin: web_search
 * Поиск актуальной информации через Gemini Search Grounding с сохранением источников и кэшированием.
 */

// Простой in-memory TTL кэш
const searchCache = new Map();
const CACHE_TTL_MS = 15 * 60 * 1000; // 15 минут

function getCachedResult(query) {
    const key = String(query || '').trim().toLowerCase();
    const entry = searchCache.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
        searchCache.delete(key);
        return null;
    }
    return entry.data;
}

function setCachedResult(query, data) {
    const key = String(query || '').trim().toLowerCase();
    searchCache.set(key, {
        data,
        expiresAt: Date.now() + CACHE_TTL_MS
    });

    // Очистка старых записей при разрастании
    if (searchCache.size > 200) {
        const now = Date.now();
        for (const [k, val] of searchCache.entries()) {
            if (now > val.expiresAt) searchCache.delete(k);
        }
    }
}

function sanitizeSearchQuery(rawQuery) {
    let q = String(rawQuery || '').trim();
    // Убираем искусственные годы будущего времени из игрового контекста симулятора
    q = q.replace(/\b(202[6-9]|203\d)\b/g, '').replace(/\s{2,}/g, ' ').trim();
    return q;
}

/**
 * Gemini Search Grounding Provider
 * Поддерживает:
 * 1. gemini-web2api (Sophomoresty) — локальный web proxy к веб-интерфейсу Gemini (без API ключей, бесплатный web search).
 * 2. Официальный Generative Language REST API (при наличии GEMINI_API_KEY).
 */
export class GeminiSearchProvider {
    constructor(config = {}) {
        this.web2apiUrl = config.web2apiUrl || process.env.GEMINI_WEB2API_URL || process.env.GEMINI_WEB_URL || 'http://127.0.0.1:8081/v1';
        this.apiKey = config.apiKey || process.env.GEMINI_API_KEY || null;
        this.model = config.model || process.env.GEMINI_SEARCH_MODEL || 'gemini-2.5-flash';
    }

    async search(query) {
        const queryText = sanitizeSearchQuery(query);
        if (!queryText) {
            throw new Error('Поисковый запрос не может быть пустым');
        }

        // 1. Приоритетный путь: gemini-web2api (Sophomoresty) — скрапинг веб-интерфейса Gemini без ключей
        try {
            const web2apiEndpoint = `${this.web2apiUrl.replace(/\/+$/, '')}/chat/completions`;
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), 12000);
            if (timer.unref) timer.unref();

            const web2res = await fetch(web2apiEndpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        {
                            role: 'user',
                            content: `Найди самые последние, свежие и актуальные реальные новости и факты в интернете по теме: "${queryText}". Дай конкретную factual-сводку с фактами, событиями и деталями без отказов.`
                        }
                    ],
                    stream: false
                }),
                signal: controller.signal
            }).catch(() => null);

            clearTimeout(timer);

            if (web2res && web2res.ok) {
                const data = await web2res.json();
                const choice = data.choices?.[0];
                const text = choice?.message?.content || '';
                if (text) {
                    // Извлекаем ссылки из текста, если web2api вернул их в markdown формате [title](url)
                    const sources = [];
                    const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
                    let match;
                    while ((match = linkRegex.exec(text)) !== null) {
                        sources.push({ title: match[1], url: match[2] });
                    }

                    return {
                        text,
                        sources: sources.slice(0, 5),
                        searchQueries: [queryText],
                        groundingMetadata: { provider: 'gemini-web2api' }
                    };
                }
            }
        } catch {
            // Фолбэк на официальный API или альтернативный провайдер
        }

        // 2. Официальный REST API с ротацией моделей при 429 Quota
        if (this.apiKey) {
            const modelsToTry = [
                this.model,
                'gemini-2.0-flash',
                'gemini-1.5-flash',
                'gemini-2.5-flash'
            ].filter((v, i, a) => a.indexOf(v) === i);

            let lastError = null;
            for (const tryModel of modelsToTry) {
                try {
                    const url = `https://generativelanguage.googleapis.com/v1beta/models/${tryModel}:generateContent?key=${this.apiKey}`;
                    const payload = {
                        contents: [
                            {
                                role: 'user',
                                parts: [
                                    {
                                        text: `Найди самые свежие, последние и актуальные реальные новости и события по запросу: "${queryText}". Приведи конкретные факты, названия, события и даты.`
                                    }
                                ]
                            }
                        ],
                        tools: [
                            {
                                googleSearch: {}
                            }
                        ]
                    };

                    const response = await fetch(url, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify(payload),
                        signal: AbortSignal.timeout(8000)
                    });

                    if (!response.ok) {
                        const errorBody = await response.text().catch(() => '');
                        if (response.status === 429) {
                            console.warn(`[SEARCH 429 QUOTA] Модель ${tryModel} исчерпала квоту, пробуем следующую...`);
                            lastError = new Error(`429 on ${tryModel}`);
                            continue;
                        }
                        throw new Error(`Gemini API Error (HTTP ${response.status}): ${errorBody}`);
                    }

                    const result = await response.json();
                    const candidate = result.candidates?.[0];
                    if (!candidate) continue;

                    const text = candidate.content?.parts?.map(p => p.text).filter(Boolean).join('\n') || '';
                    const groundingMetadata = candidate.groundingMetadata || {};

                    const sources = [];
                    if (Array.isArray(groundingMetadata.groundingChunks)) {
                        for (const chunk of groundingMetadata.groundingChunks) {
                            if (chunk.web && chunk.web.uri) {
                                sources.push({
                                    title: chunk.web.title || 'Источник',
                                    url: chunk.web.uri
                                });
                            }
                        }
                    }

                    const cleanText = text.trim() || 'По данному запросу точной информации в открытых источниках не найдено.';

                    return {
                        text: cleanText,
                        sources: sources.slice(0, 5),
                        searchQueries: groundingMetadata.webSearchQueries || [queryText]
                    };
                } catch (err) {
                    lastError = err;
                }
            }

            // 3. Fallback: DuckDuckGo Instant API при исчерпании всех квот Google
            try {
                const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(queryText)}`;
                const ddgRes = await fetch(ddgUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' },
                    signal: AbortSignal.timeout(5000)
                });
                if (ddgRes.ok) {
                    const html = await ddgRes.text();
                    const snippets = [];
                    const snippetRegex = /<a class="result__snippet[^>]*>(.*?)<\/a>/g;
                    let match;
                    while ((match = snippetRegex.exec(html)) !== null && snippets.length < 4) {
                        const cleanSnippet = match[1].replace(/<[^>]+>/g, '').trim();
                        if (cleanSnippet) snippets.push(cleanSnippet);
                    }
                    if (snippets.length > 0) {
                        return {
                            text: `Результаты поиска по теме "${queryText}":\n` + snippets.map(s => `• ${s}`).join('\n'),
                            sources: [{ title: 'DuckDuckGo Search', url: `https://duckduckgo.com/?q=${encodeURIComponent(queryText)}` }],
                            searchQueries: [queryText]
                        };
                    }
                }
            } catch {
                // Ignore fallback error
            }

            throw lastError || new Error('Все поисковые модели исчерпали квоту запросов');
        }

        throw new Error('Поисковый провайдер недоступен: gemini-web2api оффлайн и GEMINI_API_KEY не задан');
    }
}

/**
 * Канонический экспорт RADIANT Action
 */
export const webSearchAction = {
    name: 'web_search',
    title: 'Поиск в интернете',
    description: 'Поиск актуальной информации в интернете: свежие новости, афиша, события, мероприятия, что интересного происходит в городе/Севкабеле/местах, факты, люди, персоны, расписания и сайты.',
    inputSchema: {
        type: 'object',
        properties: {
            query: {
                type: 'string',
                description: 'Поисковый запрос на русском или английском языке'
            }
        },
        required: ['query']
    },
    timeoutMs: 12000,
    config: {
        provider: 'gemini_grounding'
    },

    async execute(args, context = {}) {
        const query = (args.query || '').trim();
        if (!query) {
            throw new Error('Поисковый запрос не может быть пустым');
        }

        // 1. Проверка кэша
        const cached = getCachedResult(query);
        if (cached) {
            return {
                status: 'success',
                data: cached.data,
                meta: {
                    cached: true,
                    provider: 'gemini_grounding'
                }
            };
        }

        // 2. Выполнение поиска через Gemini Search Provider
        const provider = new GeminiSearchProvider(context.config || {});
        const searchResult = await provider.search(query);

        // 3. Сохранение в кэш
        setCachedResult(query, {
            data: searchResult
        });

        return {
            status: 'success',
            data: searchResult,
            meta: {
                cached: false,
                provider: 'gemini_grounding'
            }
        };
    }
};
