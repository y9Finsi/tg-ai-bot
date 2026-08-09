import { getMemorySettings, getMemoryProvider, getUserMemories, saveUserMemory, deactivateUserMemory, appendConversationEvent } from '../database.js';
import { getCachedOpenAIClient } from './llm_client.js';
import { logLlmTrace } from './llm_client.js';

export async function extractFactsInBackground(userId, userText) {
    if (!userText || userText.trim().length < 3) return { success: false, reason: "Text too short" };
    
    // Игнорируем простые приветствия и общие фан-реакции
    if (/^(привет|приветик|хай|ку|ага|угу|да|нет|неа|ок|окей|спасибо|спасиб|хаха+|ахах+|ясно|понял(?:а)?|пон|как дела|че делаешь)$/i.test(userText.trim())) {
        return { success: false, reason: "Generic greeting or reaction" };
    }

    try {
        const memSettings = await getMemorySettings();
        if (!memSettings.is_enabled) return { success: false, reason: "Memory disabled" };

        const provider = await getMemoryProvider();
        if (!provider) return { success: false, reason: "No memory provider" };

        const existingMemories = await getUserMemories(userId, 30);
        const existingListText = existingMemories.length > 0
            ? existingMemories.map(m => `(id:${m.id}) ${m.fact}`).join('\n')
            : 'Пока нет сохраненных фактов.';

        const prompt = `Ты — модуль извлечения долгосрочной памяти о пользователе.
Проанализируй реплику пользователя и выдели НОВЫЕ важные долгосрочные факты о нем (имя, город, возраст, профессия, увлечения, предпочтения, отношения, кинки, важные люди).

[ТЕКУЩИЕ ФАКТЫ В БАЗЕ]:
${existingListText}

[СООБЩЕНИЕ ПОЛЬЗОВАТЕЛЯ]:
"${userText}"

[ПРАВИЛА]:
1. Извлекай только реальные устойчивые факты о ПОЛЬЗОВАТЕЛЕ, которые прямо следуют из его сообщения.
2. Если пользователь просто задал вопрос без личных фактов о себе — верни пустой new_facts.
3. Если пользователь обновил или отменил старый факт (например: переехал, сменил имя/работу) — укажи id старого факта в deactivate_ids.
4. Ответь СТРОГО в виде валидного JSON без разметки markdown:
{
  "new_facts": [
    {"category": "identity", "fact": "Сформулированный факт от 3-го лица (например: Имя пользователя — Богдан)"}
  ],
  "deactivate_ids": []
}`;

        const client = getCachedOpenAIClient(provider.base_url, provider.api_key, 10000);
        const completion = await client.chat.completions.create({
            model: provider.model_name,
            messages: [{ role: 'system', content: prompt }],
            temperature: 0.2,
            max_tokens: 400
        });
        logLlmTrace({ userId, kind: 'MEMORY', mode: 'fact-extractor', providerName: provider.name, model: provider.model_name, userText, systemPrompt: prompt, messages: [{ role: 'system', content: prompt }], rawResponse: completion.choices[0]?.message?.content || '', usage: completion.usage || {} });

        const raw = completion.choices[0]?.message?.content || '';
        const cleanJson = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);

        let savedCount = 0;
        if (parsed.deactivate_ids && Array.isArray(parsed.deactivate_ids)) {
            for (const id of parsed.deactivate_ids) {
                await deactivateUserMemory(id, userId);
                await appendConversationEvent({
                    userId,
                    eventType: 'FORGET',
                    role: 'system',
                    content: `Деактивирован факт памяти #${id}`,
                    metadata: { memory_id: id },
                    status: 'COMPLETED'
                }).catch(() => null);
            }
        }

        if (parsed.new_facts && Array.isArray(parsed.new_facts)) {
            for (const item of parsed.new_facts) {
                if (item.fact && item.fact.trim()) {
                    await saveUserMemory(userId, item.fact);
                    await appendConversationEvent({
                        userId,
                        eventType: 'REMEMBER',
                        role: 'system',
                        content: item.fact,
                        metadata: { category: item.category || 'general' },
                        status: 'COMPLETED'
                    }).catch(() => null);
                    console.log(`🧠 [MEMORY SAVED for user ${userId} via ${provider.name}]: (${item.category || 'general'}) ${item.fact}`);
                    savedCount++;
                }
            }
        }

        return { success: true, savedCount, parsed, providerName: provider.name };
    } catch (err) {
        console.error(`⚠️ [MEMORY EXTRACTION ERROR] user ${userId}:`, err.message);
        return { success: false, error: err.message };
    }
}

export async function extractConversationEffects(userId, userText) {
    if (!userText) return { success: false, reason: 'empty dialogue' };
    try {
        const provider = await getMemoryProvider();
        if (!provider) return { success: false, reason: 'No memory provider' };
        const prompt = `Проанализируй диалог и верни только JSON служебных эффектов.
Пользователь: ${userText || ''}
Фиксируй MUTE только если явно понятно, что Лера замолчала/занята/спит или пользователь попросил не писать.
Фиксируй REACTION только если есть явная реакция, которую нужно сохранить.
Формат: {"mute":null или {"reason":"...","until":null},"reaction":null или {"emoji":"...","text":"..."}}`;

        const client = getCachedOpenAIClient(provider.base_url, provider.api_key, 8000);
        const completion = await client.chat.completions.create({
            model: provider.model_name,
            messages: [{ role: 'system', content: prompt }],
            temperature: 0.2,
            max_tokens: 300
        });
        logLlmTrace({ userId, kind: 'MEMORY_EFFECTS', mode: 'conversation-effects', providerName: provider.name, model: provider.model_name, userText, systemPrompt: prompt, messages: [{ role: 'system', content: prompt }], rawResponse: completion.choices[0]?.message?.content || '', usage: completion.usage || {} });
        const raw = completion.choices[0]?.message?.content || '';
        const cleanJson = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
        const parsed = JSON.parse(cleanJson);
        return { success: true, parsed };
    } catch (err) {
        return { success: false, error: err.message };
    }
}
