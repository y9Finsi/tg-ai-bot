import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('..', import.meta.url);
const read = relative => fs.readFileSync(new URL(relative, root), 'utf8');

test('channel API separates non-publishing draft generation from explicit publication', () => {
    const server = read('src/server.js');
    const poster = read('src/channel_poster.js');

    assert.match(server, /app\.post\('\/api\/admin\/channel\/draft'/);
    assert.match(server, /generateChannelPostDraft\(\)/);
    assert.match(server, /app\.post\('\/api\/admin\/channel\/publish-draft'/);
    assert.match(server, /publishChannelDraft\(botInstance, req\.body/);
    assert.match(poster, /export async function generateChannelPostDraft/);
    assert.match(poster, /export async function publishChannelDraft/);
    const draftBody = poster.slice(poster.indexOf('export async function generateChannelPostDraft'), poster.indexOf('export async function publishChannelDraft'));
    assert.doesNotMatch(draftBody, /sendMessage|sendPhoto/);
});

test('channel settings validate editor controls and post history stores only safe provenance', () => {
    const server = read('src/server.js');
    const database = read('src/db/database.js');
    const poster = read('src/channel_poster.js');

    assert.match(server, /channel_prompt_blocks/);
    assert.match(server, /Math\.max\(0, Math\.min\(2, Number\(temperature/);
    assert.match(database, /provenance JSONB NOT NULL DEFAULT '\{\}'::jsonb/);
    assert.match(database, /telegram_message_ids JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
    assert.match(database, /export async function deleteChannelPostLog/);
    assert.match(server, /app\.delete\('\/api\/admin\/channel\/history\/:id'/);
    assert.match(poster, /prompt_blocks: promptBlocks/);
    assert.doesNotMatch(poster, /api_key.*provenance|provenance.*api_key/i);
});

test('prompt editor exposes the shared day context without choosing a personal chat user', () => {
    const server = read('src/server.js');

    assert.match(server, /app\.get\('\/api\/admin\/prompt-day-context'/);
    const endpoint = server.slice(server.indexOf("app.get('/api/admin/prompt-day-context'"), server.indexOf('// =========================================================================', server.indexOf("app.get('/api/admin/prompt-day-context'")));
    assert.match(endpoint, /ContextBuilder\.buildTelegramContextDetailed\(null\)/);
});

test('channel draft and publication do not force photos on purely textual posts', () => {
    const poster = read('src/channel_poster.js');

    assert.doesNotMatch(poster, /settings\.media_mode === 'none'/);
    assert.match(poster, /const isMediaRequested = Boolean\(/);
    assert.match(poster, /if \(isMediaRequested && !contentMedia && !photoToSend/);
});

