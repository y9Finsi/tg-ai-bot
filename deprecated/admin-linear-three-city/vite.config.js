import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
    root: 'admin-linear',
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(process.cwd(), 'admin-linear/src')
        }
    },
    server: {
        port: 5173,
        proxy: {
            '/api': 'http://localhost:3000',
            '/radiant': 'http://localhost:3000'
        }
    },
    build: {
        outDir: '../public/admin-linear',
        emptyOutDir: true,
        rollupOptions: {
            input: 'admin-linear/index.html',
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) return 'vendor';
                }
            }
        }
    }
});
