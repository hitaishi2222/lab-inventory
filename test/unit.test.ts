import { describe, expect, it } from 'vitest'
import { likeContains, parsePagination } from '../src/server/lib/query'
import { maskEmail, redact } from '../src/server/lib/log'
import { PLACEHOLDER_DATABASE_ID, withDatabaseId } from '../scripts/wrangler-config'

describe('redact', () => {
  it('strips credentials from connection URLs', () => {
    expect(redact('libsql://user:pa55@db.example.io/lab')).toBe('libsql://***@db.example.io/lab')
  })

  it('masks tokens in query strings, key=value and JSON', () => {
    expect(redact('libsql://db.io?authToken=abc123&x=1')).toBe('libsql://db.io?authToken=***&x=1')
    expect(redact('password: hunter2')).toBe('password: ***')
    expect(redact('{"url":"libsql://x?authToken=abc","password":"hunter2"}')).toBe(
      '{"url":"libsql://x?authToken=***","password":"***"}',
    )
  })

  it('leaves ordinary log lines intact', () => {
    expect(redact('Migrations applied [Lab → file:./data/lab.db].')).toBe(
      'Migrations applied [Lab → file:./data/lab.db].',
    )
  })

  it('masks email local parts but keeps the domain', () => {
    expect(maskEmail('jane.doe@lab.edu')).toBe('j***@lab.edu')
    expect(maskEmail('not-an-email')).toBe('***')
  })
})

describe('parsePagination', () => {
  it('defaults to page 1, 20 rows', () => {
    expect(parsePagination({})).toEqual({ page: 1, limit: 20, offset: 0 })
  })

  it('computes the offset', () => {
    expect(parsePagination({ page: '3', limit: '10' })).toEqual({ page: 3, limit: 10, offset: 20 })
  })

  it('clamps the limit so a client cannot ask for the whole table', () => {
    expect(parsePagination({ limit: '100000' }).limit).toBe(200)
    expect(parsePagination({ limit: '0' }).limit).toBe(1)
  })

  it('tolerates junk instead of producing NaN offsets', () => {
    expect(parsePagination({ page: '-4', limit: 'abc' })).toEqual({ page: 1, limit: 20, offset: 0 })
  })
})

describe('likeContains', () => {
  it('wraps the term and caps its length', () => {
    expect(likeContains('  beaker ')).toBe('%beaker%')
    expect(likeContains('x'.repeat(500))).toBe(`%${'x'.repeat(100)}%`)
  })
})

describe('wrangler config generation', () => {
  const committed = `{
  "name": "lab-inventory",
  "d1_databases": [{ "binding": "DB", "database_name": "lab-inventory", "database_id": "${PLACEHOLDER_DATABASE_ID}" }]
}`

  it('swaps only the D1 id, leaving the rest of the committed config intact', () => {
    const id = '11111111-2222-3333-4444-555555555555'
    const out = withDatabaseId(committed, id)
    expect(out).toContain(`"database_id": "${id}"`)
    expect(out).not.toContain(PLACEHOLDER_DATABASE_ID)
    expect(out.replace(id, PLACEHOLDER_DATABASE_ID)).toBe(committed)
  })

  it('is a no-op without a D1 id, so CI dry-runs use the committed file', () => {
    expect(withDatabaseId(committed, undefined)).toBe(committed)
    expect(withDatabaseId(committed, '   ')).toBe(committed)
  })

  it('only touches the first binding', () => {
    const two = `{
  "d1_databases": [
    { "binding": "DB", "database_id": "${PLACEHOLDER_DATABASE_ID}" },
    { "binding": "DB2", "database_id": "other" }
  ]
}`
    const out = withDatabaseId(two, '11111111-2222-3333-4444-555555555555')
    expect(out).toContain('"database_id": "11111111-2222-3333-4444-555555555555"')
    expect(out).toContain('"database_id": "other"')
  })
})
