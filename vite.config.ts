import path from 'path'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  base: '/',
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
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    coverage: {
      include: ['src/**/*.{ts,tsx}'],
      // src/main.tsx is the Vite entry — pure side effects (CSS imports,
      // i18n init, root mount). It can't run in jsdom and there's nothing
      // worth asserting against, so it's excluded from coverage.
      exclude: ['src/types/*', 'src/main.tsx', '**/__tests__/**'],
    },
  },
})
