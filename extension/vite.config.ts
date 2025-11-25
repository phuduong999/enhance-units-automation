import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'shared': path.resolve(__dirname, '../shared')
    }
  },
  build: {
    rollupOptions: {
      input: {
        sidepanel: path.resolve(__dirname, 'index.html'),
      },
    },
    outDir: 'dist',
    emptyOutDir: true
  }
});
