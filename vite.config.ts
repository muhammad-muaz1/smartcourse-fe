/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // The gateway is the only backend the browser ever talks to. Proxying it in dev keeps
  // the app same-origin: no CORS preflights, and response headers such as X-Request-ID
  // and Idempotent-Replayed stay readable without an expose-headers allowlist.
  const gateway = env.VITE_GATEWAY_URL ?? 'http://localhost:8000'
  const proxy = { target: gateway, changeOrigin: true }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
    },
    server: {
      // 3000 is the gateway's default CORS origin, so a non-proxied setup also works.
      port: 3000,
      strictPort: true,
      proxy: { '/api': proxy, '/health': proxy, '/version': proxy },
    },
    build: {
      target: 'es2022',
      sourcemap: true,
      rollupOptions: {
        output: {
          // Long-lived vendor chunks: app deploys don't bust the cache for these.
          manualChunks(id) {
            if (!id.includes('node_modules')) return undefined
            if (/recharts|d3-|victory-vendor/.test(id)) return 'charts'
            if (/react-router|react-dom|scheduler|\/react\//.test(id)) return 'react'
            if (/@tanstack/.test(id)) return 'query'
            return undefined
          },
        },
      },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  }
})
