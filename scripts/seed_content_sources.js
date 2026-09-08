import { query } from '../src/db/database.js';

export const INITIAL_SOURCES = [
    {
        name: 'Родной Звук (Инди-музыка)',
        source_type: 'telegram',
        url_or_handle: 'rodzvuk',
        topics: ['музыка', 'инди', 'новинки', 'плейлисты'],
        is_trusted: true
    },
    {
        name: 'КудаГо: Питер',
        source_type: 'telegram',
        url_or_handle: 'kudagospb',
        topics: ['питер', 'афиша', 'выставки', 'куда пойти', 'спб'],
        is_trusted: true
    },
    {
        name: 'Бумага | Новости Петербурга',
        source_type: 'telegram',
        url_or_handle: 'paperpaper_ru',
        topics: ['питер', 'город', 'культура', 'новости'],
        is_trusted: true
    },
    {
        name: 'The Flow',
        source_type: 'telegram',
        url_or_handle: 'theflowru',
        topics: ['музыка', 'культура', 'поп-культура', 'релизы', 'клипы'],
        is_trusted: true
    },
    {
        name: 'DNative — блог про SMM',
        source_type: 'telegram',
        url_or_handle: 'dnative',
        topics: ['smm', 'маркетинг', 'соцсети', 'тренды', 'медиа'],
        is_trusted: true
    },
    {
        name: 'KEXP Live Sessions (Инди-лайвы)',
        source_type: 'youtube',
        url_or_handle: 'https://www.youtube.com/@KEXP',
        topics: ['live', 'инди', 'концерты', 'музыка', 'вайб'],
        is_trusted: true
    },
    {
        name: 'COLORS Studios (Стильная музыка)',
        source_type: 'youtube',
        url_or_handle: 'https://www.youtube.com/@COLORSxSTUDIOS',
        topics: ['live', 'эстетика', 'музыка', 'вайб'],
        is_trusted: true
    },
    {
        name: 'NPR Tiny Desk Concerts',
        source_type: 'youtube',
        url_or_handle: 'https://www.youtube.com/@nprmusic',
        topics: ['live', 'акустика', 'инди', 'музыка'],
        is_trusted: true
    },
    {
        name: 'Яндекс Музыка: Местное инди',
        source_type: 'yandex_music',
        url_or_handle: 'https://music.yandex.ru/users/yamusic-top/playlists/1005',
        topics: ['музыка', 'инди', 'русский инди', 'пост-панк', 'яндекс музыка'],
        is_trusted: true
    },
    {
        name: 'Яндекс Музыка: Инди лучшее',
        source_type: 'yandex_music',
        url_or_handle: 'https://music.yandex.ru/users/yamusic-top/playlists/1036',
        topics: ['музыка', 'инди', 'шугейз', 'дрим-поп', 'яндекс музыка'],
        is_trusted: true
    },
    {
        name: 'Manga Read (Рекомендации манги)',
        source_type: 'telegram',
        url_or_handle: 'manga_read',
        topics: ['манга', 'манхва', 'mangalib', 'хентай', 'тайтлы'],
        is_trusted: true
    },
    {
        name: 'ReManga (Новинки манхвы и манги)',
        source_type: 'telegram',
        url_or_handle: 'remanga',
        topics: ['манга', 'манхва', 'remanga', 'главы', 'тайтлы'],
        is_trusted: true
    },
    {
        name: 'Manga 18+ (Пикантная манга и главы)',
        source_type: 'telegram',
        url_or_handle: 'manga_18_plus',
        topics: ['хентай', 'манга', '18+', 'додзинси', 'hentai'],
        is_trusted: true
    }
];

export async function seedSources() {
    console.log(`🌱 Заполняем базу источниками контента для Леры (${INITIAL_SOURCES.length} шт.)...`);
    for (const s of INITIAL_SOURCES) {
        await query(
            `INSERT INTO content_sources (name, source_type, url_or_handle, topics, is_trusted, enabled)
             VALUES ($1, $2, $3, $4, $5, TRUE)
             ON CONFLICT (source_type, url_or_handle)
             DO UPDATE SET name = EXCLUDED.name, topics = EXCLUDED.topics, is_trusted = EXCLUDED.is_trusted`,
            [s.name, s.source_type, s.url_or_handle, JSON.stringify(s.topics), s.is_trusted]
        );
        console.log(`  ✓ [${s.source_type.toUpperCase()}] ${s.name} (@${s.url_or_handle})`);
    }
    console.log('✅ Все источники успешно добавлены/обновлены!');
}

if (process.argv[1] && process.argv[1].endsWith('seed_content_sources.js')) {
    seedSources().then(() => process.exit(0)).catch(err => {
        console.error('❌ Ошибка сидинга источников:', err);
        process.exit(1);
    });
}
