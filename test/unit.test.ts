import { describe, expect, it } from 'vitest'
import { likeContains, parsePagination } from '../src/server/lib/query'
import { maskEmail, redact } from '../src/server/lib/log'

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
