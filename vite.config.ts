import path from 'path'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

import pkg from './package.json' with { type: 'json' }

// Steam's news API has no CORS headers. In production a Lambda Function URL
// behind CloudFront serves /api/game-news; in dev this middleware runs the
// same handler in-process so the SPA always uses a relative URL.
function steamNewsDevProxy(): Plugin {
  return {
    name: 'steam-news-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/game-news', async (req, res) => {
        try {
          const { handleSteamNews } = await import('./infra/lambda/steam-news/handler')
          const url = new URL(req.url ?? '/', 'http://localhost')
          const result = await handleSteamNews({ count: url.searchParams.get('count') })
          res.statusCode = result.status
          for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v)
          res.end(result.body)
        } catch (err) {
          res.statusCode = 500
          res.setHeader('Content-Type', 'application/json; charset=UTF-8')
          res.end(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), steamNewsDevProxy()],
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'infra/lambda/**/*.test.ts'],
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      // src/main.tsx is the Vite entry — pure side effects (CSS imports,
      // i18n init, root mount). It can't run in jsdom and there's nothing
      // worth asserting against, so it's excluded from coverage.
      exclude: ['src/types/*', 'src/main.tsx', '**/__tests__/**'],
    },
  },
})
