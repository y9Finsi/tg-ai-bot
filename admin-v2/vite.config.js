import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
    root: 'admin-v2',
    // Relative assets keep the same build usable at / and /admin-v2.
    base: './',
    plugins: [react()],
    build: {
        outDir: '../public/admin-v2',
        emptyOutDir: true,
        rollupOptions: { input: 'admin-v2/index.html' }
    }
});
