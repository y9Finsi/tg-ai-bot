import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const logFile = path.join(root, 'server.log');
const out = fs.openSync(logFile, 'a');
const err = fs.openSync(logFile, 'a');

const subprocess = spawn(process.execPath, [
    '--env-file=.env',
    '-e',
    "import('./src/server.js').then(m => m.startAdminServer())"
], {
    cwd: root,
    detached: true,
    stdio: ['ignore', out, err]
});

subprocess.unref();
console.log('Admin server spawned detached PID:', subprocess.pid);
