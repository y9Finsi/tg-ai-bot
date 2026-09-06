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
    optimizeDeps: {
        exclude: ['maplibre-gl']
    },
    server: {
        port: 5173,
        proxy: {
            '/api': {
                target: process.env.ADMIN_API_TARGET || 'http://127.0.0.1:3000',
                changeOrigin: true
            },
            '/radiant': {
                target: process.env.ADMIN_API_TARGET || 'http://127.0.0.1:3000',
                changeOrigin: true
            }
        }
    },
    build: {
        outDir: '../public/admin-linear',
        emptyOutDir: true,
        rollupOptions: {
            input: {
                main: path.resolve(process.cwd(), 'admin-linear/index.html')
            },
            output: {
                manualChunks(id) {
                    if (id.includes('node_modules')) return 'vendor';
                }
            }
        }
    }
});
