import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = relative => fs.readFileSync(path.join(root, relative), 'utf8');

test('routed production prompt uses explicit modules with matching few-shot examples', () => {
    const prompts = read('src/prompts.js');

    assert.doesNotMatch(prompts, /routingPromptDefaults/);
    for (const file of ['lera_core.txt', 'lera_common.txt', 'lera_casual.txt', 'lera_erotic.txt', 'lera_joke.txt']) {
        assert.ok(fs.existsSync(path.join(root, 'src/prompts', file)), `${file} must exist`);
    }
    assert.match(read('src/prompts/lera_casual.txt'), /Примеры:/);
    assert.match(read('src/prompts/lera_erotic.txt'), /Примеры:/);
    assert.match(read('src/prompts/lera_joke.txt'), /Примеры:/);
});

test('common routed rules keep concise speech without conflicting hard caps', () => {
    const common = read('src/prompts/lera_common.txt');

    assert.match(common, /Обычно отвечай коротко/);
    assert.doesNotMatch(common, /10-15 слов/);
    assert.match(common, /вопрос задавай, когда он действительно помогает/);
});
