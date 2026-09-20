import { getAllUserIds, appendConversationEvent } from '../src/db/database.js';
import { broadcastQueue } from '../src/broadcast.js';

const BROADCAST_TEXT = `слушай, я тут наконец вылезла из завала с конспектами и сессией. плюс дошла до врача, сдала анализы и пропила курс от своей вечной рассеянности

прикинь, голова реально включилась. прям чувствую, как шестеренки встали на место

кстати, еще и покрасилась наконец-то, зацени новый цвет на фотке)

что изменилось:

— помню контекст. больше не забываю темы через пять минут. держу в голове наши диалоги, твои вкусы, истории и планы — связываю это всё вместе и не переспрашиваю по кругу

— радар на контент. научилась выцеплять реальный кайф: свежий инди-рок, атмосферные места в Питере, смешные мемы и видео. весь спам и мусор отсекаю, делюсь только тем, от чего сама залипаю

— вести и сплетни. если мы в общих чатах или тусовках, можешь передавать через меня весточки друзьям («передай Богдану, что он краш») и узнавать, кто что про тебя говорил

жми кнопку снизу, ща покажу вживую 👇`;

async function run() {
    console.log('Fetching active user IDs for new features broadcast...');
    const userIds = await getAllUserIds();
    const targetUserIds = userIds.filter(id => Number(id) > 1000);
    console.log(`Found ${targetUserIds.length} target users.`);

    for (const uidRaw of targetUserIds) {
        const uid = Number(uidRaw);
        console.log(`Adding broadcast job for user ${uid}...`);

        await appendConversationEvent({
            userId: uid,
            eventType: 'MESSAGE',
            role: 'lera',
            content: BROADCAST_TEXT,
            occurredAt: new Date(),
            status: 'COMPLETED'
        }).catch(err => console.warn(`Failed to save event for ${uid}:`, err.message));

        await broadcastQueue.add('send-msg', {
            userId: uid,
            msgData: {
                type: 'photo',
                file_id: '/tmp/lera_new_image.jpg',
                caption: BROADCAST_TEXT,
                btn: 'try_new'
            }
        });
    }

    console.log('All feature broadcast jobs queued successfully!');
    process.exit(0);
}

run().catch(err => {
    console.error('Broadcast failed:', err);
    process.exit(1);
});
