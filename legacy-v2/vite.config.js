import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
    root: 'legacy-v2',
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(process.cwd(), 'legacy-v2/src')
        }
    },
    build: {
        outDir: '../public/legacy-v2',
        emptyOutDir: true,
        rollupOptions: { input: 'legacy-v2/index.html' }
    }
});
