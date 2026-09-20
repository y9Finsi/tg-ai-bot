import { query } from '../../../db/database.js';
import { getOpenAIClientAndModel } from '../../../ai.js';
import { getActiveTopics } from '../../../services/topic_harvester.js';

/**
 * Подбор персональной темы или материала для собеседника в рамках CONTENT_BROWSE
 */
export async function matchPersonalStoryForUser(targetUserId) {
    if (!targetUserId) return null;

    // 1. Считываем пользователя и его память
    const userRes = await query('SELECT telegram_id, first_name, username FROM users WHERE telegram_id = $1 LIMIT 1', [targetUserId]);
    const user = userRes.rows[0];
    if (!user) return null;

    const memoriesRes = await query(`
        SELECT fact FROM memory_fact
        WHERE user_id = $1 AND is_active = TRUE
        ORDER BY confidence DESC, id DESC LIMIT 6
    `, [targetUserId]).catch(() => ({ rows: [] }));
    const memories = memoriesRes.rows.map(r => r.fact);

    // Последние сообщения диалога
    const eventsRes = await query(`
        SELECT role, content FROM conversation_events
        WHERE user_id = $1 AND status = 'COMPLETED' AND event_type IN ('MESSAGE', 'INITIATIVE')
        ORDER BY occurred_at DESC LIMIT 6
    `, [targetUserId]).catch(() => ({ rows: [] }));
    const recentMessages = eventsRes.rows.reverse();

    // Свежие темы из банка
    const activeTopics = await getActiveTopics({ limit: 5 });

    const prompt = `Ты — Лера (19 лет, студентка СПбГИК, СММ-щица в СПб). Ты сейчас сидишь дома, листаешь ленту в телефоне и думаешь о своем друге ${user.first_name || 'собеседнике'}.

ФАКТЫ ИЗ ПАМЯТИ О НЁМ:
${memories.length ? memories.map(m => `- ${m}`).join('\n') : 'Мало фактов, обычный знакомый.'}

ПОСЛЕДНИЕ РЕПЛИКИ ДИАЛОГА:
${recentMessages.map(m => `${m.role === 'lera' ? 'Лера' : 'Он'}: ${m.content}`).join('\n') || 'Давно не общались.'}

ТЕМЫ ИЗ ТВОЕЙ ЛЕНТЫ СЕГОДНЯ:
${activeTopics.map(t => `- [${t.category}]: ${t.title} (${t.situation})`).join('\n') || 'Обычный день в Питере.'}

ЗАДАЧА:
Придумай, чем живым и искренним ты сейчас хочешь с ним поделиться.
ВАЖНО — ВАРИАТИВНОСТЬ:
НЕ НАДО ВСЕГДА ЗАДАВАТЬ ДУРАЦКИЕ ВОПРОСЫ В КОНЦЕ («хочешь расскажу?», «а ты как?») — так общаются только боты!
Иногда реальные люди:
1. Просто делятся тем, что увидели / сделали / подумали («я щас такой кринж нашла ахах», «купила себе маркеры, сижу кайфую», «промокла насквозь пока шла с пар»).
2. Вспоминают прошлый разговор («кстати, ты говорил про тот сериал...»).
3. Либо вбрасывают интригующую зацепку, если история длинная.

Верни СТРОГО JSON:
{
  "mode": "DIRECT_SHARE" или "INTRIGUE_HOOK",
  "text": "Твое живое сообщение в личку строчными буквами по-питерски",
  "topic_id": ${activeTopics[0]?.id || 'null'},
  "story_followup": ["реплика 1 если будет продолжать", "реплика 2"]
}`;

    try {
        const { client, model } = await getOpenAIClientAndModel();
        const response = await client.chat.completions.create({
            model,
            messages: [{ role: 'user', content: prompt }],
            temperature: 0.8,
            max_tokens: 800
        });

        const raw = response.choices?.[0]?.message?.content || '{}';
        const clean = raw.replace(/^```json/i, '').replace(/```$/i, '').trim();
        return JSON.parse(clean);
    } catch (err) {
        console.warn('[PERSONAL CONTENT MATCHER ERROR]:', err.message);
        return null;
    }
}
