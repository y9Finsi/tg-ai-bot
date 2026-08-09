/**
 * 3-Layer Hierarchical Memory Summarizer (Daily, Weekly, Monthly Digests)
 *
 * Layer 1 (DAILY)   — condenses raw sim_diary rows of the last day.
 * Layer 2 (WEEKLY)  — condenses the DAILY digests of the ISO week.
 * Layer 3 (MONTHLY) — condenses the WEEKLY digests of the month.
 *
 * All writes are idempotent per period label, so re-running a digest never
 * duplicates rows. Failures are swallowed and logged: the summarizer must never
 * break the chat engine or the simulation worker.
 */

import { StateRepository } from '../db/state_repository.js';
import { generateCompletion } from '../ai/llm_client.js';

/** YYYY-MM-DD in Europe/Moscow. */
function moscowDateStr(date = new Date()) {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date);
}

/** ISO week label like 2026-W32. */
function isoWeekLabel(date = new Date()) {
    const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/** YYYY-MM label. */
function monthLabel(date = new Date()) {
    return moscowDateStr(date).slice(0, 7);
}

export class MemorySummarizer {
    static timer = null;
    /**
     * Layer 1: summarizes the past day's raw diary entries into 3 concise points.
     */
    static async generateDailyLifeDigest() {
        try {
            const rawEntries = await StateRepository.getFactualEventsSince(new Date(Date.now() - 24 * 60 * 60 * 1000), 100);
            if (!rawEntries || rawEntries.length === 0) return null;

            const formattedLogs = rawEntries.map(e => `[${e.occurred_at}] ${e.event_type} ${JSON.stringify(e.payload || {})}`).join('\n');

            const prompt = `Ты — система суммаризации памяти Леры (19 лет, Питер).
Вот сухой лог произошедшего за прошедшие сутки:
${formattedLogs}

Сформируй ровно 3 кратких предложения от 1-го лица (главные события и мысли дня):`;

            const summaryText = await generateCompletion(prompt, { temperature: 0.3, trace: { kind: 'MEMORY_DIGEST', userId: 0 } });
            if (!summaryText || !summaryText.trim()) return null;

            const todayStr = moscowDateStr();

            await StateRepository.saveMemoryDigest({
                digestType: 'DAILY',
                streamType: 'LIFE_DIARY',
                periodLabel: todayStr,
                summaryText: summaryText.trim()
            });

            console.log(`🧠 [MemorySummarizer] Daily Life Digest generated for ${todayStr}`);
            return summaryText;
        } catch (err) {
            console.error('❌ [MemorySummarizer DAILY Error]:', err.message);
            return null;
        }
    }

    /**
     * Layer 2: rolls up the last 7 DAILY digests into one weekly digest.
     */
    static async generateWeeklyDigest(now = new Date()) {
        try {
            const dailies = await StateRepository.getMemoryDigests({ streamType: 'LIFE_DIARY', limit: 30 });
            const onlyDaily = dailies.filter(d => d.digest_type === 'DAILY').slice(0, 7);
            if (onlyDaily.length < 2) return null;

            const body = onlyDaily
                .slice()
                .reverse()
                .map(d => `[${d.period_label}] ${d.summary_text}`)
                .join('\n');

            const prompt = `Ты — система долговременной памяти Леры (19 лет, Питер).
Вот дневные сводки за последнюю неделю:
${body}

Сформируй 3-4 предложения от 1-го лица: ключевые события недели, изменения настроения и главный вывод. Без списков, живым языком:`;

            const summaryText = await generateCompletion(prompt, { temperature: 0.3, trace: { kind: 'MEMORY_DIGEST', userId: 0 } });
            if (!summaryText || !summaryText.trim()) return null;

            const label = isoWeekLabel(now);
            await StateRepository.saveMemoryDigest({
                digestType: 'WEEKLY',
                streamType: 'LIFE_DIARY',
                periodLabel: label,
                summaryText: summaryText.trim()
            });

            console.log(`🧠 [MemorySummarizer] Weekly Digest generated for ${label}`);
            return summaryText;
        } catch (err) {
            console.error('❌ [MemorySummarizer WEEKLY Error]:', err.message);
            return null;
        }
    }

    /**
     * Layer 3: rolls up WEEKLY digests of the current month into an epoch digest.
     */
    static async generateMonthlyDigest(now = new Date()) {
        try {
            const digests = await StateRepository.getMemoryDigests({ streamType: 'LIFE_DIARY', limit: 60 });
            const label = monthLabel(now);
            const weeklies = digests.filter(d => d.digest_type === 'WEEKLY').slice(0, 6);
            if (weeklies.length < 2) return null;

            const body = weeklies
                .slice()
                .reverse()
                .map(d => `[${d.period_label}] ${d.summary_text}`)
                .join('\n');

            const prompt = `Ты — система долговременной памяти Леры (19 лет, Питер).
Вот недельные сводки:
${body}

Сформируй 3-4 предложения от 1-го лица: главный вектор месяца, что изменилось в жизни и в отношениях. Живым языком, без списков:`;

            const summaryText = await generateCompletion(prompt, { temperature: 0.3, trace: { kind: 'MEMORY_DIGEST', userId: 0 } });
            if (!summaryText || !summaryText.trim()) return null;

            await StateRepository.saveMemoryDigest({
                digestType: 'MONTHLY',
                streamType: 'LIFE_DIARY',
                periodLabel: label,
                summaryText: summaryText.trim()
            });

            console.log(`🧠 [MemorySummarizer] Monthly Digest generated for ${label}`);
            return summaryText;
        } catch (err) {
            console.error('❌ [MemorySummarizer MONTHLY Error]:', err.message);
            return null;
        }
    }

    /** Layer 1 for one user: actual completed conversation events from the last day. */
    static async generateDailyUserDigest(userId, now = new Date()) {
        try {
            const since = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const events = await StateRepository.getConversationEventsForDigest(userId, since, 300);
            if (events.length < 2) return null;
            const body = events.map(event =>
                `[${event.occurred_at}] ${event.role}: ${String(event.content).slice(0, 1200)}`
            ).join('\n');
            const prompt = `Ты — система памяти отношений Леры с одним пользователем.
Ниже реальный диалог за последние сутки:
${body}

Сформируй 3 кратких предложения: что важного произошло, что пользователь чувствовал/хотел и как развивались отношения. Не выдумывай факты:`;
            const summaryText = await generateCompletion(prompt, { temperature: 0.2, trace: { kind: 'MEMORY_DIGEST', userId } });
            if (!summaryText?.trim()) return null;
            await StateRepository.saveMemoryDigest({
                digestType: 'DAILY',
                streamType: 'USER_CHAT',
                periodLabel: moscowDateStr(now),
                summaryText: summaryText.trim(),
                userId
            });
            return summaryText;
        } catch (err) {
            console.error(`❌ [MemorySummarizer USER DAILY ${userId}]:`, err.message);
            return null;
        }
    }

    static async generateWeeklyUserDigest(userId, now = new Date()) {
        return this.generateUserRollup({
            userId,
            sourceType: 'DAILY',
            digestType: 'WEEKLY',
            periodLabel: isoWeekLabel(now),
            limit: 7,
            minimum: 2
        });
    }

    static async generateMonthlyUserDigest(userId, now = new Date()) {
        return this.generateUserRollup({
            userId,
            sourceType: 'WEEKLY',
            digestType: 'MONTHLY',
            periodLabel: monthLabel(now),
            limit: 6,
            minimum: 2
        });
    }

    static async generateUserRollup({ userId, sourceType, digestType, periodLabel, limit, minimum }) {
        try {
            const digests = await StateRepository.getMemoryDigests({ streamType: 'USER_CHAT', userId, limit: 60 });
            const sources = digests.filter(item => item.digest_type === sourceType).slice(0, limit);
            if (sources.length < minimum) return null;
            const body = sources.slice().reverse().map(item => `[${item.period_label}] ${item.summary_text}`).join('\n');
            const prompt = `Ты — система иерархической памяти отношений Леры с пользователем.
Ниже сводки уровня ${sourceType}:
${body}

Сожми их в 3-4 точных предложения: ключевые события, устойчивые предпочтения и изменение отношений. Ничего не выдумывай:`;
            const summaryText = await generateCompletion(prompt, { temperature: 0.2, trace: { kind: 'MEMORY_DIGEST', userId } });
            if (!summaryText?.trim()) return null;
            await StateRepository.saveMemoryDigest({
                digestType,
                streamType: 'USER_CHAT',
                periodLabel,
                summaryText: summaryText.trim(),
                userId
            });
            return summaryText;
        } catch (err) {
            console.error(`❌ [MemorySummarizer USER ${digestType} ${userId}]:`, err.message);
            return null;
        }
    }

    /**
     * Runs the layers that are due: daily always, weekly on Mondays, monthly on the 1st.
     * Safe to call once a day from the funnel scheduler.
     */
    static async runScheduledDigests(now = new Date()) {
        const results = { daily: null, weekly: null, monthly: null };
        results.daily = await this.generateDailyLifeDigest();

        const mskDate = moscowDateStr(now);
        const dayOfMonth = Number(mskDate.slice(8, 10));
        const weekday = new Date(`${mskDate}T12:00:00Z`).getUTCDay(); // 1 = Monday

        if (weekday === 1) {
            results.weekly = await this.generateWeeklyDigest(now);
        }
        if (dayOfMonth === 1) {
            results.monthly = await this.generateMonthlyDigest(now);
        }
        return results;
    }

    /** Starts one daily run at 03:15 MSK. Existing unique keys make restarts safe. */
    static startScheduler() {
        if (this.timer) return;

        const scheduleNext = () => {
            const now = new Date();
            const mskParts = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit'
            }).format(now);
            const nextMsk = new Date(`${mskParts}T03:15:00+03:00`);
            if (nextMsk <= now) nextMsk.setUTCDate(nextMsk.getUTCDate() + 1);
            const delay = Math.max(1000, nextMsk.getTime() - now.getTime());

            this.timer = setTimeout(async () => {
                await this.runScheduledDigests().catch(err =>
                    console.error('❌ [MemorySummarizer Scheduler]:', err.message)
                );
                this.timer = null;
                scheduleNext();
            }, delay);
        };

        scheduleNext();
        console.log('🧠 [MemorySummarizer] Планировщик дайджестов установлен на 03:15 MSK.');
    }

    static stopScheduler() {
        if (this.timer) clearTimeout(this.timer);
        this.timer = null;
    }
}
