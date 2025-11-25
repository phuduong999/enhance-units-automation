import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'shared': path.resolve(__dirname, '../shared')
    }
  },
  build: {
    lib: {
      entry: path.resolve(__dirname, 'src/content/index.ts'),
      name: 'ContentScript',
      fileName: () => 'src/content/index.js',
      formats: ['iife']
    },
    outDir: 'dist',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        extend: true,
      }
    }
  },
  define: {
    'process.env': {}
  }
});
