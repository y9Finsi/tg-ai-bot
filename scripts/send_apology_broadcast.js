import { getAllUsers, appendConversationEvent } from '../src/db/database.js';
import { broadcastQueue } from '../src/broadcast.js';

const APOLOGY_TEXT = `Блин, слушай... Прости за дичь и странные сообщения, которые могли приходить в чат((
Там какой-то лютый баг в телеге произошел (или меня вообще взломать пытались), я думала, что строчу знакомому по работе, и всё на свете перепутала капец((

Больше такого бреда не будет, я всё починила и настроила. Ты как вообще?`;

async function run() {
    console.log('Fetching active users for apology broadcast...');
    const users = await getAllUsers();
    const targetUsers = users.filter(u => !u.is_blocked && Number(u.telegram_id) > 1000);
    console.log(`Found ${targetUsers.length} target users.`);

    for (const user of targetUsers) {
        const uid = Number(user.telegram_id);
        console.log(`Adding broadcast job for user ${uid}...`);

        await appendConversationEvent({
            userId: uid,
            eventType: 'MESSAGE',
            role: 'lera',
            content: APOLOGY_TEXT,
            occurredAt: new Date(),
            status: 'COMPLETED'
        }).catch(err => console.warn(`Failed to save event for ${uid}:`, err.message));

        await broadcastQueue.add('send-msg', {
            userId: uid,
            msgData: {
                type: 'text',
                text: APOLOGY_TEXT,
                btn: 'none'
            }
        });
    }

    console.log('All apology broadcast jobs queued successfully!');
    process.exit(0);
}

run().catch(err => {
    console.error('Broadcast failed:', err);
    process.exit(1);
});
