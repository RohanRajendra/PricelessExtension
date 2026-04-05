import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  plugins: [
    react(),
    // Copy static extension files that don't need bundling
    viteStaticCopy({
      targets: [
        { src: 'manifest.json', dest: '.' },
        { src: 'data', dest: '.' },
        { src: 'icons', dest: '.' },
        // onnxruntime-web WASM binary — must live at extension root for chrome.runtime.getURL()
        {
          src: 'node_modules/onnxruntime-web/dist/ort-wasm-simd-threaded.wasm',
          dest: '.',
        },
      ],
    }),
  ],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        // React UI entry points
        popup: resolve(__dirname, 'popup/index.html'),
        dashboard: resolve(__dirname, 'dashboard/index.html'),
        // Extension scripts bundled as separate IIFE/ES modules
        'background/service-worker': resolve(__dirname, 'background/service-worker.js'),
        'content/tracker-detector': resolve(__dirname, 'content/tracker-detector.js'),
      },
      output: {
        // Keep entry file names predictable so manifest.json paths stay correct
        entryFileNames: (chunk) => {
          if (chunk.name === 'background/service-worker') return 'background/service-worker.js';
          if (chunk.name === 'content/tracker-detector') return 'content/tracker-detector.js';
          return 'assets/[name]-[hash].js';
        },
        chunkFileNames: 'assets/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },
  },
});
