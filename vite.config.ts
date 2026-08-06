import fs from 'fs'
import path from 'path'

import { sentryVitePlugin } from '@sentry/vite-plugin'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vitest/config'

import pkg from './package.json' with { type: 'json' }

// Test files that use file-level `vi.mock` / `vi.doMock` can't share the module
// registry enabled by `isolate: false` below — a mock registered in one file
// leaks into every other file in the same worker. Those files run in the
// isolated project instead.
//
// This list is DERIVED by scanning test sources rather than hand-maintained: a
// stale manual list (it referenced a since-moved NavBar test) previously let a
// leaked `steam-news` mock break an unrelated news-badge test. Detecting the
// usage directly means adding a `vi.mock` to a file can never silently flake.
function findMockUsingTestFiles(): string[] {
  const found: string[] = []
  const visit = (dir: string): void => {
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return // root doesn't exist (e.g. no infra/ in some checkouts)
    }
    for (const entry of entries) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        visit(full)
      } else if (/\.test\.tsx?$/.test(entry.name)) {
        if (/\bvi\.(mock|doMock)\s*\(/.test(fs.readFileSync(full, 'utf8'))) {
          found.push(
            path
              .relative(import.meta.dirname, full)
              .split(path.sep)
              .join('/')
          )
        }
      }
    }
  }
  for (const root of ['src', 'infra']) visit(path.resolve(import.meta.dirname, root))
  return found
}

const MOCK_USING_TEST_FILES = findMockUsingTestFiles()

// Steam's news API has no CORS headers. In production a Lambda Function URL
// behind CloudFront serves /api/game-news; in dev this middleware runs the
// same handler in-process so the SPA always uses a relative URL.
function steamNewsDevProxy(): Plugin {
  return {
    name: 'steam-news-dev-proxy',
    configureServer(server) {
      server.middlewares.use('/api/game-news', async (req, res) => {
        try {
          const { handleSteamNews } = await import('./infra/lambda/steam-news/handler.ts')
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
  plugins: [
    react(),
    steamNewsDevProxy(),
    sentryVitePlugin({
      org: 'ect-xe',
      project: 'eco-crafter-toolkit',
      authToken: process.env.SENTRY_AUTH_TOKEN,
      sourcemaps: {
        filesToDeleteAfterUpload: [
          './**/*.map',
          '.*/**/public/**/*.map',
          './dist/**/client/**/*.map',
        ],
      },
      telemetry: false,
    }),
  ],
  base: '/',
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    pool: 'threads',
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      // src/main.tsx is the Vite entry — pure side effects (CSS imports,
      // i18n init, root mount). It can't run in jsdom and there's nothing
      // worth asserting against, so it's excluded from coverage.
      exclude: ['src/types/*', 'src/main.tsx', '**/__tests__/**'],
    },
    // `isolate: false` shares the jsdom document and module cache between test
    // files in a worker — roughly a 4x speedup. The trade-off is that file-level
    // `vi.mock` calls leak between files because the module registry is shared.
    // Files that rely on per-file mocks are listed in `MOCK_USING_TEST_FILES`
    // and run in the isolated project below. Adding a new `vi.mock` to a test
    // file means adding it to that list, otherwise the mock will flake.
    projects: [
      {
        extends: true,
        test: {
          name: 'shared',
          include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'infra/lambda/**/*.test.ts'],
          exclude: MOCK_USING_TEST_FILES,
          isolate: false,
        },
      },
      {
        extends: true,
        test: {
          name: 'isolated',
          include: MOCK_USING_TEST_FILES,
          isolate: true,
        },
      },
    ],
  },
})
