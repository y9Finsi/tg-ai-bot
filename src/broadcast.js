import { Queue, Worker } from 'bullmq';

// Парсим URL из .env и жестко задаем IPv4 (family: 4)
const redisUrl = new URL(process.env.REDIS_URL || 'redis://127.0.0.1:6379');
const connection = {
    host: redisUrl.hostname,
    port: parseInt(redisUrl.port, 10) || 6379,
    family: 4 // Спасает от ошибки EAI_AGAIN в Docker
};

export const broadcastQueue = new Queue('broadcast', {
    connection,
    defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { age: 24 * 60 * 60, count: 1000 },
        removeOnFail: { age: 7 * 24 * 60 * 60, count: 5000 }
    }
});
let broadcastWorker = null;

export function startBroadcastWorker(bot) {
    if (broadcastWorker) return broadcastWorker;
    broadcastWorker = new Worker('broadcast', async job => {
        const { userId, msgData } = job.data;
        // Для обратной совместимости, если в очереди остались старые задачи
        const data = msgData || { type: 'text', text: job.data.messageText, btn: 'none' };

        let replyMarkup = {};
            if (data.btn && data.btn !== 'none') {
                const btnNames = { profile: '👤 Профиль', ai: '🧠 Настройка ИИ', refs: '👥 Рефералы', help: '🆘 Помощь', store: '⭐️ Магазин' };
                const cbData = { profile: 'menu_profile', ai: 'menu_ai', refs: 'menu_refs', help: 'menu_help', store: 'trigger_buy' };
                replyMarkup = {
                    inline_keyboard: [[{ text: btnNames[data.btn] || data.btn, callback_data: cbData[data.btn] || data.btn }]]
                };
            }

            if (data.type === 'text') {
                await bot.telegram.sendMessage(userId, data.text, {
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup.inline_keyboard ? replyMarkup : undefined
                });
            } else if (data.type === 'photo') {
                await bot.telegram.sendPhoto(userId, data.file_id, {
                    caption: data.caption,
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup.inline_keyboard ? replyMarkup : undefined
                });
            } else if (data.type === 'video') {
                await bot.telegram.sendVideo(userId, data.file_id, {
                    caption: data.caption,
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup.inline_keyboard ? replyMarkup : undefined
                });
            } else if (data.type === 'document') {
                await bot.telegram.sendDocument(userId, data.file_id, {
                    caption: data.caption,
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup.inline_keyboard ? replyMarkup : undefined
                });
            } else if (data.type === 'animation') {
                await bot.telegram.sendAnimation(userId, data.file_id, {
                    caption: data.caption,
                    parse_mode: 'HTML',
                    reply_markup: replyMarkup.inline_keyboard ? replyMarkup : undefined
                });
            }

            // Пауза от спам-лимитов (35 сообщений в секунду Telegram)
            await new Promise(resolve => setTimeout(resolve, 35));
    }, {
        connection,
        concurrency: 1,
        lockDuration: 120000,
        stalledInterval: 30000
    });
    return broadcastWorker;
}

export async function stopBroadcastWorker() {
    if (broadcastWorker) await broadcastWorker.close();
    broadcastWorker = null;
}
