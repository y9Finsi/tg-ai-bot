import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
    root: 'admin-v2',
    // Relative assets keep the same build usable at / and /admin-v2.
    base: './',
    plugins: [react(), tailwindcss()],
    resolve: {
        alias: {
            '@': path.resolve(process.cwd(), 'admin-v2/src')
        }
    },
    build: {
        outDir: '../public/admin-v2',
        emptyOutDir: true,
        rollupOptions: {
            input: 'admin-v2/index.html',
            output: {
                manualChunks(id) {
                    return id.includes('node_modules') ? 'vendor' : undefined;
                }
            }
        }
    }
});
