import { StateRepository } from '../db/state_repository.js';
import { GOAPPlanner } from '../radiant/goap_planner.js';
import { publishDevtoolEvent } from '../devtools/event_bus.js';
import { getOrderedAiProviders } from '../database.js';
import { getCachedOpenAIClient, logLlmTrace } from './llm_client.js';

const COMMANDS = {
    MOVE: { taskType: 'USER_TRAVEL', targetLocation: 'cafe_sloy', durationMinutes: 30 },
    FOOD: { taskType: 'EMERGENCY_EAT', targetLocation: 'petrogradka_home', durationMinutes: 30 },
    WORK: { taskType: 'WORK_LAPTOP', targetLocation: 'petrogradka_home', durationMinutes: 60 },
    REST: { taskType: 'REST_HOME', targetLocation: 'petrogradka_home', durationMinutes: 60 },
    SOCIAL: { taskType: 'SOCIAL_NASTYA', targetLocation: 'bar_rubinsteina', durationMinutes: 90 }
};

function fallbackClassify(text) {
    if (/\b(иди|сходи|езжай|поезжай)\b/i.test(text)) return 'MOVE';
    if (/\b(поешь|ешь|купи.*ед|закажи.*ед)\b/i.test(text)) return 'FOOD';
    if (/\b(работай|сделай.*работ|верстай)\b/i.test(text)) return 'WORK';
    if (/\b(отдохни|поспи|ложись)\b/i.test(text)) return 'REST';
    if (/\b(позвони|встреться|иди.*наст)\b/i.test(text)) return 'SOCIAL';
    return null;
}

async function classifyCommandIntent(text, userId) {
    const fallback = fallbackClassify(text || '');
    if (!fallback) return null;
    try {
        const provider = (await getOrderedAiProviders())?.[0];
        if (!provider) return fallback;
        const messages = [
            { role: 'system', content: 'Ты строгий классификатор распоряжений. Верни только JSON: {"is_command":true|false,"intent":"MOVE|FOOD|WORK|REST|SOCIAL|null"}. Вопросы и разговор не являются командами.' },
            { role: 'user', content: String(text).slice(0, 1200) }
        ];
        const client = getCachedOpenAIClient(provider.base_url, provider.api_key, provider.timeout_ms || 7000);
        const startedAt = Date.now();
        const response = await client.chat.completions.create({ model: provider.model_name, messages, temperature: 0, max_tokens: 80 });
        const rawText = response.choices?.[0]?.message?.content || '';
        await logLlmTrace({ userId, kind: 'INTENT_CLASSIFIER', mode: 'command-classifier', model: provider.model_name, providerName: provider.name, userText: text, messages, rawResponse: rawText, usage: response.usage || {}, latencyMs: Date.now() - startedAt });
        const parsed = JSON.parse(rawText.replace(/```json|```/gi, '').trim());
        return parsed?.is_command === true && Object.hasOwn(COMMANDS, parsed.intent) ? parsed.intent : null;
    } catch (error) {
        publishDevtoolEvent('command_gate', { status: 'CLASSIFIER_FALLBACK', reason: error.message, text });
        return fallback;
    }
}

export async function validateUserCommand(text, { batchId = null, userId = null } = {}) {
    const intent = await classifyCommandIntent(text, userId);
    if (!intent) return { isCommand: false };
    const command = COMMANDS[intent];
    const state = await StateRepository.getState();
    const willingness = GOAPPlanner.explainWillingness(state || {});
    if (willingness.value < 30) {
        publishDevtoolEvent('command_gate', { status: 'BLOCKED', reason: 'WILLINGNESS_BELOW_THRESHOLD', willingness: willingness.value, intent, text });
        return { isCommand: true, accepted: false, code: 'COMMAND_REFUSED', willingness };
    }
    const task = await StateRepository.withTransaction(async client => {
        const createdResult = await StateRepository.enqueueTask(client, {
            ...command,
            priority: 70,
            createdBy: 'USER_COMMAND',
            importance: 2,
            idempotencyKey: batchId ? `command:${batchId}` : `command:${String(text).trim().toLowerCase()}`,
            activeScopeKey: batchId ? `command:${batchId}` : null
        });
        const created = createdResult.task;
        await StateRepository.addRationale(client, { category: 'USER_COMMAND', title: `Команда принята: ${created.task_type}`, explanation: `Willingness ${willingness.value}%.`, payload: { taskId: created.id, willingness, intent } });
        return created;
    });
    publishDevtoolEvent('command_gate', { status: 'ACCEPTED', taskId: task.id, willingness: willingness.value, intent, text });
    return { isCommand: true, accepted: true, code: 'COMMAND_ACCEPTED', willingness, task };
}
