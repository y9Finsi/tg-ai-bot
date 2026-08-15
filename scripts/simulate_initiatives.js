import { generateAiInitiativeResponse } from '../src/ai.js';
import { getContentCandidates, getUser } from './../src/db/database.js';
import { Telegraf } from 'telegraf';

const USER_ID = 952039543; // Богдан
const bot = new Telegraf(process.env.BOT_TOKEN);

function splitLadder(text) {
    if (!text) return [];
    return text.split('|||').map(s => s.trim()).filter(Boolean);
}

async function sendLadder(chatId, text) {
    const parts = splitLadder(text);
    if (parts.length === 0) return;
    for (let i = 0; i < parts.length; i++) {
        await bot.telegram.sendMessage(chatId, parts[i]);
        if (i < parts.length - 1) {
            await new Promise(r => setTimeout(r, 1200));
        }
    }
}

async function run() {
    console.log('--- STARTING 4 INITIATIVES SIMULATION FOR BOGDAN ---');
    const user = await getUser(USER_ID);
    if (!user) {
        console.error('User not found!');
        process.exit(1);
    }
    console.log(`User found: @${user.username} (ID: ${user.telegram_id})`);

    const contentCandidates = await getContentCandidates(USER_ID, 'initiative', 4);

    const stages = [
        {
            kind: 'new_day',
            reason: 'наступил новый день, а вы сегодня ещё не общались',
            anchorEventId: 2357,
            title: '1. NEW_DAY (Утренний старт нового дня)'
        },
        {
            kind: 'open',
            reason: 'естественно продолжить последний незакрытый диалог',
            anchorEventId: 2357,
            title: '2. OPEN (Возврат к теме ночного разговора)'
        },
        {
            kind: 'ignore_1',
            reason: 'пользователь не ответил на реплику Леры',
            anchorEventId: 2358,
            title: '3. IGNORE_1 (Пинг после паузы собеседника)'
        },
        {
            kind: 'idle_4h',
            reason: 'после дневной паузы поинтересоваться как дела, связав со своим днем в Питере',
            anchorEventId: 2357,
            title: '4. IDLE_4H (Дневная пауза 4+ часов)'
        }
    ];

    const results = [];

    for (let i = 0; i < stages.length; i++) {
        const stage = stages[i];
        console.log(`\n>>> [STAGE ${i+1}/4]: ${stage.title}`);

        const start = Date.now();
        try {
            const resp = await generateAiInitiativeResponse(USER_ID, stage.reason, {
                initiativeKind: stage.kind,
                anchorEventId: stage.anchorEventId,
                contentCandidates: stage.kind === 'idle_4h' ? contentCandidates : []
            });

            const durationMs = Date.now() - start;
            console.log(`Duration: ${durationMs}ms`);
            console.log('AI Response:', JSON.stringify(resp, null, 2));

            if (resp?.blockedByJudge) {
                console.warn(`[BLOCKED BY JUDGE] Initiative was blocked.`);
                results.push({ stage: stage.kind, success: false, reason: 'BLOCKED_BY_JUDGE', durationMs });
                continue;
            }

            if (!resp?.text) {
                console.error(`[EMPTY RESPONSE] Text is empty!`);
                results.push({ stage: stage.kind, success: false, reason: 'EMPTY_TEXT', durationMs });
                continue;
            }

            console.log(`Delivering to Telegram user @${user.username}...`);
            await sendLadder(USER_ID, resp.text);
            console.log(`[DELIVERED]`);

            results.push({
                stage: stage.kind,
                success: true,
                text: resp.text,
                durationMs,
                contentId: resp.contentId || null
            });

            if (i < stages.length - 1) {
                console.log('Waiting 3.5s before next initiative...');
                await new Promise(r => setTimeout(r, 3500));
            }
        } catch (err) {
            console.error(`Error on stage ${stage.kind}:`, err.message);
            results.push({ stage: stage.kind, success: false, error: err.message });
        }
    }

    console.log('\n--- SIMULATION SUMMARY ---');
    console.log(JSON.stringify(results, null, 2));
    process.exit(0);
}

run().catch(e => {
    console.error('Fatal Error:', e);
    process.exit(1);
});
