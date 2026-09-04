import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { VitePWA } from 'vite-plugin-pwa';
import { defineConfig } from 'vitest/config';

// In development the client runs on :5173 and proxies /api to the Nest server on :3000.
// In production Nest serves the built assets from client/dist as a single process.
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    /*
     * Installable PWA (PRD 9.1).
     *
     * Offline scope is deliberately narrow: the app shell plus whatever dashboard data was
     * last fetched, read-only. Offline writes are explicitly out of scope for v1 -- an
     * expense queued on a device and silently replayed later would corrupt the carry-over
     * chain in ways the user could not see.
     */
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon-32.png', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'datebud - Date Budget Tracker',
        short_name: 'datebud',
        description: 'Budget weekend yang ditentukan sama disiplin hari kerja.',
        lang: 'id',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#F5F6FB',
        theme_color: '#5C63C4',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        navigateFallback: '/index.html',
        // The API is never precached; only the last successful dashboard read is kept, and
        // only as a fallback while the network is unavailable.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: /^\/api\/reports\//,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'datebud-reports',
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
          {
            urlPattern: /^\/api\/receipts\/\d+\/file/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'datebud-receipts',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: [],
  },
});
