import { createSemanticaClient } from '../memory/semantica_client.js';

const DEFAULT_LIMIT = 8;
const DEFAULT_THRESHOLD = 0.65;
const CORE_FACT_LIMIT = 3;

function validUserId(userId) {
    return userId !== undefined && userId !== null && String(userId).trim() !== '';
}

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function normalizeFact(item, index) {
    if (typeof item === 'string') return { id: `repo-${index}`, text: item, score: 1 };
    return {
        ...item,
        id: String(item?.id ?? item?.fact_id ?? `repo-${index}`),
        text: String(item?.text ?? item?.fact ?? item?.normalized_text ?? item?.content ?? '').trim(),
        score: Number.isFinite(Number(item?.score)) ? Number(item.score) : 1
    };
}

function normalizeFacts(facts) {
    return asArray(facts).map(normalizeFact);
}

function isCoreFact(fact) {
    const category = String(fact?.payload?.category || fact?.payload?.type || '').toLowerCase();
    const text = String(fact?.text || '').toLocaleLowerCase('ru-RU');

    if (!category) {
        // Preserve compatibility with lightweight repository fakes and legacy
        // core records that do not carry typed payload metadata.
        return true;
    }
    if (['identity', 'name', 'profession', 'home_location'].includes(category)) return true;
    return category === 'location'
        && (text.includes('живёт') || text.includes('живет'))
        && !text.includes('сейчас находится');
}

function selectCoreFacts(facts) {
    return normalizeFacts(facts)
        .filter(isCoreFact)
        .slice(0, CORE_FACT_LIMIT);
}

function factKey(fact) {
    const id = String(fact?.id ?? '').trim();
    if (id && !/^(?:repo|result)-\d+$/.test(id)) return `id:${id}`;
    return `text:${String(fact?.text ?? '').trim().toLocaleLowerCase('ru-RU')}`;
}

function dedupe(facts, threshold, limit) {
    const seen = new Set();
    return normalizeFacts(facts).filter((fact) => {
        const key = factKey(fact);
        if (!fact.text || fact.score < threshold || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).slice(0, limit);
}

function buildCandidateTrace(candidates, selectedFacts, threshold) {
    const selectedIds = new Map(
        selectedFacts.map((fact, index) => [factKey(fact), index + 1])
    );
    const seen = new Set();

    return normalizeFacts(candidates).map((fact, index) => {
        const key = factKey(fact);
        const selectedRank = selectedIds.get(key) || null;
        let exclusionReason = null;
        if (!fact.text) exclusionReason = 'empty_text';
        else if (Number(fact.score) < threshold) exclusionReason = 'below_threshold';
        else if (seen.has(key)) exclusionReason = 'duplicate';
        else if (selectedRank === null) exclusionReason = 'not_selected';
        if (!seen.has(key)) seen.add(key);

        return {
            ...fact,
            candidateRank: index + 1,
            selected: selectedRank !== null,
            selectedRank,
            exclusionReason,
            finalScore: fact.score
        };
    });
}

async function callRepository(repository, names, args, objectArgs = null) {
    for (const name of names) {
        if (typeof repository?.[name] === 'function') {
            const method = repository[name];
            const objectStyle = objectArgs && ['search', 'searchMemory', 'searchFacts', 'searchArchiveMemory'].includes(name);
            const value = objectStyle && method.length <= 1
                ? await method.call(repository, objectArgs)
                : await method.call(repository, ...args);
            return asArray(value);
        }
    }
    return [];
}

export function compactPromptText(facts, { maxChars = 2400 } = {}) {
    let output = '';
    for (const fact of asArray(facts)) {
        const line = `- ${String(fact.text ?? fact.fact ?? '').trim()}`;
        if (line === '- ') continue;
        if (output && output.length + line.length + 1 > maxChars) break;
        output += `${output ? '\n' : ''}${line}`;
    }
    return output;
}

export function createContextRetriever({ repository, semantica, client, mode, threshold = DEFAULT_THRESHOLD, limit = DEFAULT_LIMIT, maxPromptChars = 2400 } = {}) {
    const semanticaClient = client || semantica || createSemanticaClient({ mode });
    const selectedMode = mode || semanticaClient.mode || 'disabled';

    return async function retrieveContext({ userId, query = '', limit: requestLimit = limit, threshold: requestThreshold = threshold } = {}) {
        if (!validUserId(userId)) throw new TypeError('Context retrieval requires userId');
        const startedAt = Date.now();
        const effectiveLimit = Math.max(1, Math.floor(Number(requestLimit) || limit));
        const effectiveThreshold = Number.isFinite(Number(requestThreshold)) ? Number(requestThreshold) : threshold;
        const request = { userId, query, limit: effectiveLimit, threshold: effectiveThreshold };
        const core = dedupe(
            selectCoreFacts(await callRepository(
                repository,
                ['getCoreFacts', 'getCoreMemory', 'listCoreFacts'],
                [userId],
                { userId }
            )),
            0,
            CORE_FACT_LIMIT
        );
        const repositoryCandidates = normalizeFacts(
            await callRepository(
                repository,
                ['search', 'searchMemory', 'searchFacts', 'searchArchiveMemory'],
                [userId, query, effectiveLimit, effectiveThreshold],
                request
            )
        ).map((fact) => ({ ...fact, source: fact.source || 'repository' }));
        const trace = {
            query_text: String(query || ''),
            source: selectedMode === 'active' ? 'semantic_empty' : 'repository_fallback',
            strategy: selectedMode === 'active' ? 'semantic_retrieval' : 'repository_retrieval',
            latency_ms: 0,
            fallbackReason: null,
            selected: [],
            candidates: [],
            shadow: [],
            metadata: {
                mode: selectedMode,
                threshold: effectiveThreshold,
                limit: effectiveLimit,
                semantic_candidates: 0,
                semantic_selected: 0,
                repository_selected: 0,
                core_selected: core.length,
                injected_count: 0
            }
        };
        let derived = [];

        if (selectedMode !== 'disabled') {
            try {
                derived = normalizeFacts(
                    await semanticaClient.search({ userId, query, limit: effectiveLimit, threshold: effectiveThreshold })
                ).map((fact) => ({ ...fact, source: 'semantica' }));
                trace.shadow = selectedMode === 'shadow' ? derived : [];
            } catch (error) {
                trace.fallbackReason = error?.name === 'AbortError' ? 'timeout' : (error?.message || 'semantica_error');
            }
        }

        const semanticCandidates = selectedMode === 'active' ? derived : [];
        const candidates = selectedMode === 'active'
            ? [...semanticCandidates, ...repositoryCandidates]
            : repositoryCandidates;
        // Core is authoritative and bypasses the semantic threshold. The final
        // pass also removes overlaps between core and derived/repository facts.
        const selected = dedupe([
            ...core.map((fact) => ({ ...fact, score: 1 })),
            ...candidates
        ], effectiveThreshold, Number.MAX_SAFE_INTEGER);
        const semanticSelectedCount = selected.filter(fact => fact.source === 'semantica').length;
        const repositorySelectedCount = selected.filter(fact => fact.source === 'repository').length;
        if (selectedMode === 'active') {
            if (semanticSelectedCount > 0 && repositorySelectedCount > 0) trace.source = 'hybrid';
            else if (semanticSelectedCount > 0) trace.source = 'semantic';
            else if (trace.fallbackReason) trace.source = 'semantic_error';
            else if (repositorySelectedCount > 0) trace.source = 'repository_fallback';
            else trace.source = 'semantic_empty';
        } else if (repositorySelectedCount > 0 || core.length > 0) {
            trace.source = 'repository_fallback';
        } else {
            trace.source = 'semantic_empty';
        }
        trace.metadata.source = trace.source;
        trace.metadata.semantic_candidates = derived.length;
        trace.metadata.semantic_selected = semanticSelectedCount;
        trace.metadata.repository_selected = repositorySelectedCount;
        trace.metadata.injected_count = selected.length;
        trace.metadata.memory = {
            source: trace.source,
            semantic_candidates: derived.length,
            semantic_selected: semanticSelectedCount,
            repository_selected: repositorySelectedCount,
            injected_count: selected.length,
            fallback_reason: trace.fallbackReason
        };
        trace.metadata.latency_ms = Date.now() - startedAt;
        trace.metadata.fallbackReason = trace.fallbackReason;
        trace.latency = trace.metadata.latency_ms;
        trace.selected = selected;
        trace.candidates = buildCandidateTrace(
            [
                ...core.map((fact) => ({ ...fact, score: 1, source: 'core' })),
                ...candidates
            ],
            selected,
            effectiveThreshold
        );
        return {
            facts: selected,
            coreFacts: core,
            promptText: compactPromptText(selected, { maxChars: maxPromptChars }),
            trace
        };
    };
}

export async function retrieveContext(options, request) {
    return createContextRetriever(options)(request);
}

export { dedupe };
