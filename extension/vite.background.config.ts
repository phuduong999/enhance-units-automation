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
      entry: path.resolve(__dirname, 'src/background/index.ts'),
      name: 'BackgroundScript',
      fileName: () => 'src/background/index.js',
      formats: ['es']
    },
    outDir: 'dist',
    emptyOutDir: false
  },
  define: {
    'process.env': {}
  }
});
