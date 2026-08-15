import { generateAiInitiativeResponse } from '../src/ai.js';
import { getContentCandidates, getUser, appendConversationEvent } from './../src/db/database.js';
import { generateLeraVoice } from '../src/services/voice_generator.js';
import { sendCatalogContent } from '../src/content_service.js';
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
    console.log('🚀 [SIMULATION] Запуск инициативы с КОНТЕНТОМ + ГОЛОСОВЫМ для Богдана...');
    const user = await getUser(USER_ID);
    if (!user) {
        console.error('User not found!');
        process.exit(1);
    }
    console.log(`👤 Пользователь: @${user.username} (ID: ${USER_ID})`);

    const contentCandidates = await getContentCandidates(USER_ID, 'initiative', 5);
    console.log(`📦 Кандидаты контента (${contentCandidates.length}):`, contentCandidates.map(c => `#${c.id} (${c.telegram_type}): ${c.description?.slice(0, 60)}`));

    // Генерируем инициативу content_4h
    console.log('\n--- 1. ГЕНЕРАЦИЯ ИНИЦИАТИВЫ С КОНТЕНТОМ ЧЕРЕЗ AI ---');
    const start = Date.now();
    const resp = await generateAiInitiativeResponse(
        USER_ID,
        'после дневной паузы самой поделиться классным треком или мемом, который сейчас слушаешь/смотришь в Питере',
        {
            initiativeKind: 'content_4h',
            anchorEventId: 2357,
            contentCandidates
        }
    );
    const durationMs = Date.now() - start;
    console.log(`⏱ AI Response (${durationMs}ms):`, JSON.stringify(resp, null, 2));

    if (!resp?.text) {
        throw new Error('AI вернул пустой текст ответа');
    }

    // Если модель по какой-то причине не прикрепила тег [CONTENT: id], выберем первого кандидата для теста
    const selectedContentId = resp.contentId || contentCandidates[0]?.id;
    console.log(`🎯 Выбранный ID контента: ${selectedContentId}`);

    // Отправляем текст в Telegram
    console.log('\n--- 2. ОТПРАВКА ТЕКСТОВОЙ ЛЕСЕНКИ В TELEGRAM ---');
    console.log(`💬 Текст: "${resp.text}"`);
    await sendLadder(USER_ID, resp.text);
    console.log('✅ Текст доставлен');

    // Генерируем голосовое сообщение
    console.log('\n--- 3. ГЕНЕРАЦИЯ И ОТПРАВКА ГОЛОСОВОГО (TTS) ---');
    const voiceText = resp.text.replace(/\|\|\|/g, '. ').replace(/https?:\/\/\S+/g, '');
    console.log(`🎙️ Текст для озвучки: "${voiceText}"`);
    
    const voiceResult = await generateLeraVoice({ text: voiceText });
    if (voiceResult?.buffer) {
        console.log(`✅ Голосовое сгенерировано (${voiceResult.buffer.length} байт, ${voiceResult.model})`);
        await bot.telegram.sendChatAction(USER_ID, 'record_voice').catch(() => {});
        await new Promise(r => setTimeout(r, 1000));
        await bot.telegram.sendVoice(USER_ID, {
            source: voiceResult.buffer,
            filename: voiceResult.filename || 'voice.ogg'
        });
        console.log('✅ Голосовое сообщение доставлено в Telegram');
    } else {
        console.warn('⚠️ Озвучка не вернула аудио-буфер');
    }

    // Отправляем контент из каталога
    if (selectedContentId) {
        console.log('\n--- 4. ДОСТАВКА КОНТЕНТА ИЗ КАТАЛОГА ---');
        const contentItem = contentCandidates.find(c => Number(c.id) === Number(selectedContentId)) || contentCandidates[0];
        if (contentItem) {
            await new Promise(r => setTimeout(r, 1500));
            await sendCatalogContent(bot.telegram, USER_ID, contentItem);
            console.log(`✅ Контент #${contentItem.id} (${contentItem.telegram_type}) доставлен в Telegram!`);
        }
    }

    console.log('\n🎉 [ИТОГ]: Инициатива с текстом + войсом + контентом полностью выполнена и доставлена!');
    process.exit(0);
}

run().catch(err => {
    console.error('❌ Fatal error:', err);
    process.exit(1);
});
