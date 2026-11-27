/**
 * Per-account config, without per-account edits.
 *
 * A D1 `database_id` is generated in *one* Cloudflare account, so a fork that
 * hard-codes its own id conflicts with upstream every time wrangler.jsonc
 * changes — and "Sync fork" then needs a merge. Keeping the id in the
 * `D1_DATABASE_ID` build secret instead means the committed config stays
 * upstream's, and a deploy generates the binding on the way out.
 *
 * Kept as a pure function (and a separate file) so the rewrite is unit-tested
 * without invoking wrangler.
 */

/** Where a deploy writes its one-off config. Gitignored. */
export const GENERATED_CONFIG = '.wrangler.deploy.jsonc'

export const COMMITTED_CONFIG = 'wrangler.jsonc'

/** `wrangler.jsonc` ships this id: it binds nothing, so a fresh account must replace it. */
export const PLACEHOLDER_DATABASE_ID = '00000000-0000-0000-0000-000000000000'

/**
 * Replace the `database_id` value with `id`, leaving every other byte of the
 * committed config alone. No id means no rewrite (the committed config is used
 * as-is, placeholder included, which is what CI's `--dry-run` wants).
 */
export function withDatabaseId(source: string, id: string | undefined): string {
  const trimmed = id?.trim()
  if (!trimmed) return source
  // First occurrence only: the file has exactly one D1 binding today, and
  // replacing further ones would silently point extra labs at the same DB.
  return source.replace(/("database_id"\s*:\s*")[^"]*(")/, `$1${trimmed}$2`)
}
