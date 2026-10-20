import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    environment: 'node',
    // Points DATABASE_URL at a throwaway sqlite file before src/server/db is
    // imported (it reads the env at module load).
    setupFiles: ['./test/setup.ts'],
    // One worker, no parallelism between files: the API tests share the
    // request-scoped lab database and run as a sequence of state changes.
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
})
