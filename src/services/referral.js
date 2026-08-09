import { addFreeRequests, query } from '../db/database.js';

export async function processReferral(bot, newUserId, referrerId) {
    if (!referrerId || newUserId === referrerId) return;

    try {
        const checkQuery = await query(
            'SELECT * FROM referrals WHERE referred_id = $1',
            [newUserId]
        );

        if (checkQuery.rows.length > 0) {
            return;
        }

        await query(
            'INSERT INTO referrals (referrer_id, referred_id) VALUES ($1, $2)',
            [referrerId, newUserId]
        );

        const BONUS_REQUESTS = 5;
        await addFreeRequests(referrerId, BONUS_REQUESTS);
        await addFreeRequests(newUserId, BONUS_REQUESTS);

        const notifyText = `🎉 *Реферальный бонус!*\n\nПо вашей ссылке присоединился новый пользователь.\nВам начислено *+${BONUS_REQUESTS} свободных запросов*!`;
        await bot.telegram.sendMessage(referrerId, notifyText, { parse_mode: 'Markdown' }).catch(() => {});

        console.log(`🎁 [REFERRAL SUCCESS] Реферер ${referrerId} и реферал ${newUserId} получили по +${BONUS_REQUESTS} запросов.`);
    } catch (e) {
        console.error("❌ Ошибка при обработке реферальной системы:", e);
    }
}
