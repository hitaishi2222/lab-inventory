import { join } from 'node:path'
import { tmpdir } from 'node:os'

/**
 * Runs before every test file, so `src/server/db` (which reads DATABASE_URL at
 * import time) points at a throwaway database instead of ./data/lab.db.
 *
 * The path is per-process because vitest runs the whole suite sequentially in
 * one worker (fileParallelism is off — the API tests share this database).
 */
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL = `file:${join(tmpdir(), `lab-test-${process.pid}.db`)}`
process.env.BETTER_AUTH_URL = 'http://localhost:3000'
process.env.BETTER_AUTH_SECRET = 'test-only-secret-0123456789abcdefghij'
// Keep the suite independent of any LAB_DATABASES / multi-lab config in the shell.
delete process.env.LAB_DATABASES
delete process.env.LAB2_DATABASE_URL
