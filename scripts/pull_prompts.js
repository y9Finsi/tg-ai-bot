import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_PROMPT_SECTIONS } from '../src/prompt_sections.js';
import { pool } from '../src/db/database.js';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const promptsDir = path.join(projectRoot, 'src', 'prompts');

function hash(text) {
    return createHash('sha256').update(text, 'utf8').digest('hex');
}

async function readPromptFromStore(key) {
    try {
        const result = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
        if (result.rows.length) return result.rows[0].value;
    } catch (error) {
        if (error.code !== '42P01') throw error;
    }

    try {
        const result = await pool.query('SELECT value FROM global_settings WHERE key = $1', [key]);
        return result.rows[0]?.value ?? null;
    } catch (error) {
        if (error.code === '42P01') return null;
        throw error;
    }
}

async function pullPrompts() {
    console.log('Syncing prompts from Prompt Store...\n');

    const remotePrompts = await Promise.all(Object.entries(ALL_PROMPT_SECTIONS).map(async ([key, filename]) => ({
        key,
        filename,
        content: await readPromptFromStore(`prompt_${key}`)
    })));
    const missing = remotePrompts.filter(item => !String(item.content || '').trim());
    if (missing.length) {
        throw new Error(`Prompt Store is missing: ${missing.map(item => item.filename).join(', ')}`);
    }

    let changed = 0;
    for (const { filename, content: remote } of remotePrompts) {
        const filePath = path.join(promptsDir, filename);
        const local = fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : '';
        if (hash(local) === hash(remote)) {
            console.log(`✓ ${filename} unchanged`);
            continue;
        }

        fs.writeFileSync(filePath, remote, 'utf8');
        console.log(`✓ ${filename} updated`);
        changed += 1;
    }

    console.log(`\nPrompt sync complete. ${changed} updated.`);
}

try {
    await pullPrompts();
} catch (error) {
    console.error(`Prompt sync failed: ${error.message}`);
    process.exitCode = 1;
} finally {
    await pool.end().catch(() => {});
}
