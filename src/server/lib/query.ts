/**
 * Shared list-query helpers.
 *
 * List endpoints used to read whole tables and slice in JavaScript: memory
 * grows with the inventory, `total` was the count of the *unfiltered* array,
 * and a client could ask for `?limit=100000` and get every row. Parse once
 * here, then let SQL do the filtering, counting and slicing.
 */

const DEFAULT_LIMIT = 20
const MAX_LIMIT = 200

export interface Pagination {
  page: number
  limit: number
  offset: number
}

export function parsePagination(query: Record<string, string | undefined>): Pagination {
  const page = Math.max(1, Number.parseInt(query.page ?? '1', 10) || 1)
  const requested = Number.parseInt(query.limit ?? String(DEFAULT_LIMIT), 10)
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isNaN(requested) ? DEFAULT_LIMIT : requested))
  return { page, limit, offset: (page - 1) * limit }
}

/**
 * `%term%` for a LIKE test. Capped so a multi-kilobyte query string cannot
 * turn into a pathological scan; wildcards are intentionally kept as
 * wildcards (that is how the search box has always behaved).
 */
export function likeContains(term: string): string {
  return `%${term.trim().slice(0, 100)}%`
}
