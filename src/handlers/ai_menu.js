import { Markup } from 'telegraf';
import { getUser, setUserPrompt, clearHistory, clearUserMemories } from '../database.js';
import { promptTemplates } from '../prompts.js';

export function setupAi(bot, userState, modeNames, getMainKeyboard) {
    bot.hears('🧠 Настройка ИИ', (ctx) => showAi(ctx, modeNames));
    bot.action('menu_ai', async (ctx) => { await ctx.answerCbQuery(); return showAi(ctx, modeNames); });

    bot.action('prompt_flirthot', async (ctx) => {
        const text = promptTemplates['prompt_flirthot'];
        const modeName = modeNames['flirthot'] || 'Лера 18+ (Вирт)';
        const userId = ctx.from.id;

        // Сохраняем новый промпт и режим в базу данных
        await setUserPrompt(userId, text, 'flirthot');
        await clearHistory(userId); // Очищаем историю

        await ctx.answerCbQuery(`Режим изменен: ${modeName}`);
        const msg = `✅ *Режим успешно изменен!*\n\n_Память прошлого диалога очищена._\n\n*Текущий режим:*\n🎭 _${modeName}_`;
        
        return ctx.editMessageText(msg, {
            parse_mode: 'Markdown',
            reply_markup: {
                inline_keyboard: [[{ text: '⬅️ Назад', callback_data: 'menu_ai' }]]
            }
        }).catch(() => {});
    });

    bot.action('prompt_custom', async (ctx) => {
        const userId = ctx.from.id;
        userState[userId] = 'WAITING_FOR_CUSTOM_PROMPT';
        await ctx.answerCbQuery();
        return ctx.editMessageText(
            `⚙️ *Свой системный промпт*\n\n` +
            `Отправьте мне текст, который опишет, как бот должен с вами общаться.\n\n` +
            `_Например: "Отвечай только стихами" или "Веди себя как 18 летняя студентка"_\n\n` +
            `👇 *Жду ваш текст (до 1000 символов):*`,
            {
                parse_mode: 'Markdown',
                reply_markup: {
                    inline_keyboard: [[{ text: '❌ Отмена', callback_data: 'cancel_input' }]]
                }
            }
        ).catch(() => {});
    });

    bot.hears(['🧹 Очистить последние сообщения', '🧹 Очистить контекст'], async (ctx) => {
        await clearHistory(ctx.from.id);
        const replyExtra = getMainKeyboard ? getMainKeyboard(ctx.from.id) : undefined;
        return ctx.reply("🧹 Последние сообщения очищены. Начинаем с чистого листа!", replyExtra);
    });

    bot.hears('🗑 Очистить всю память', async (ctx) => {
        await clearHistory(ctx.from.id);
        await clearUserMemories(ctx.from.id);
        const replyExtra = getMainKeyboard ? getMainKeyboard(ctx.from.id) : undefined;
        return ctx.reply("🗑 Вся память бота (включая долгосрочную) полностью очищена!", replyExtra);
    });
}

export async function showAi(ctx, modeNames) {
    const user = await getUser(ctx.from.id);
    const currentMode = user.roleplay_mode || 'flirthot';
    const modeName = modeNames[currentMode] || modeNames['flirthot'] || 'Лера 18+ (Вирт)';

    const msg = `🧠 *Настройки ИИ*\n\nПерсонаж: *Лера 18+ (Вирт)*.\n\n*Текущий режим:*\n🎭 _${modeName}_`;

    const kb = Markup.inlineKeyboard([
        [Markup.button.callback('🌶 Лера 18+ (Вирт)', 'prompt_flirthot')],
        [Markup.button.callback('⚙️ Свой промпт', 'prompt_custom')]
    ]);

    if (ctx.callbackQuery) {
        return ctx.editMessageText(msg, { parse_mode: 'Markdown', reply_markup: kb.reply_markup }).catch(() => {});
    }
    return ctx.reply(msg, { parse_mode: 'Markdown', reply_markup: kb.reply_markup });
}