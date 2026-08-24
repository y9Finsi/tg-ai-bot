import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = new URL('..', import.meta.url);
const read = relative => {
    if (relative === 'admin-v2/src/main.jsx') {
        const srcDir = fileURLToPath(new URL('admin-v2/src', root));
        const collect = dir => {
            let out = '';
            for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
                const full = path.join(dir, item.name);
                if (item.isDirectory()) out += collect(full);
                else if (item.name.endsWith('.jsx') || item.name.endsWith('.js')) {
                    out += fs.readFileSync(full, 'utf8') + '\n';
                }
            }
            return out;
        };
        return collect(srcDir);
    }
    return fs.readFileSync(new URL(relative, root), 'utf8');
};

test('photo catalog shows an inline Telegram preview and keeps technical IDs out of the normal card body', () => {
    const source = read('admin-v2/src/main.jsx');

    assert.match(source, /function PhotoThumbnail/);
    assert.match(source, /\/api\/admin\/photos\/\$\{photo\.id\}\/preview/);
    assert.doesNotMatch(source, /window\.open\(`\/api\/admin\/photos\/\$\{photo\.id\}\/preview`/);
    assert.match(source, /<details className="photo-expert-details">/);
    assert.match(source, /Технические данные/);
});

test('photo upload keeps the file control accessible and manual Telegram ID behind expert disclosure', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    assert.match(source, /className="photo-file-input"/);
    assert.match(source, /htmlFor="photo-upload-input"/);
    assert.match(source, /Выбрать изображение/);
    assert.match(source, /<details className="photo-expert-details">[\s\S]*Telegram file_id/);
    assert.match(css, /\.photo-file-input\s*\{\s*position:\s*absolute;/);
    assert.match(css, /\.photo-upload-form\s*\{\s*display:\s*grid;/);
});

test('channel workspace has a separate draft action, prompt builder, responsive feed and safe history actions', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    assert.match(source, /\/api\/admin\/channel\/draft/);
    assert.match(source, /\/api\/admin\/channel\/publish-draft/);
    assert.match(source, /Сгенерировать черновик/);
    assert.match(source, /Почему этот пост/);
    assert.match(source, /Удалить запись истории/);
    assert.match(source, /Температура/);
    assert.match(source, /Конструктор промпта/);
    assert.match(source, /CHANNEL_PROMPT_MODULES/);
    assert.match(source, /function PromptAssemblyMap/);
    assert.match(source, /Образ Леры/);
    assert.match(source, /Контекст дня/);
    assert.match(source, /inheritLeraPrompt/);
    assert.match(source, /\/api\/admin\/prompt-day-context/);
    assert.match(source, /Аналитика дня/);
    assert.match(source, /prompt-module-card/);
    assert.match(source, /Голос Леры/);
    assert.match(source, /Ограничения/);
    assert.match(css, /\.channel-feed-grid\s*\{\s*display:\s*grid;[\s\S]*repeat\(2, minmax\(0, 1fr\)\)/);
    assert.match(css, /@media \(max-width: 760px\)\s*\{[\s\S]*\.channel-feed-grid\s*\{\s*grid-template-columns:\s*1fr;/);
});

test('channel topic controls explain their prompt effect and keep one normalized selection distribution', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    assert.match(source, /Один режим для одного черновика/);
    assert.match(source, /Это не набор промптов/);
    assert.match(source, /Что увидит ИИ/);
    assert.match(source, /Как это работает/);
    assert.match(source, /normalizeTopicShares/);
    assert.match(source, /redistributeTopicShare/);
    assert.match(source, /Итого:/);
    assert.match(css, /\.topic-distribution-summary/);
    assert.match(css, /\.topic-prompt-explainer/);
});

test('LLM setup uses named prompt modules instead of a raw JSON editor in the regular flow', () => {
    const source = read('admin-v2/src/main.jsx');
    const css = read('admin-v2/src/feature-components.css');

    assert.match(source, /const LERA_PROMPT_MODULES/);
    assert.match(source, /Личность Леры/);
    assert.match(source, /Речь и стиль/);
    assert.match(source, /Правила и границы/);
    assert.doesNotMatch(source, />Форматировать JSON</);
    assert.match(css, /\.prompt-modules-grid\s*\{\s*display:\s*grid;/);
    assert.match(css, /\.prompt-module-card\s*\{/);
    assert.match(css, /\.prompt-assembly\s*\{/);
    assert.match(css, /\.prompt-day-preview\s*\{/);
});
