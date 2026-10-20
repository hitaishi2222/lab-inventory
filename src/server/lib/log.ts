/**
 * Server-side logger.
 *
 * Everything written to stdout/stderr is redacted first: connection URLs keep
 * their scheme and host but lose credentials, and token/password/secret style
 * key=value pairs (in plain text, query strings and JSON) are masked. Logs get
 * shipped, copied into bug reports and kept far longer than a session, so a
 * secret that lands in a log line is effectively a leaked secret.
 *
 * `log.verbatim()` bypasses redaction and exists only for values the operator
 * explicitly opted in to seeing (see LOG_RESET_LINKS in auth.ts).
 */

const SECRET_KEY = 'auth_?token|access_?token|refresh_?token|token|password|passwd|secret|api_?key|apikey|signature|sig'
const CREDENTIALS = /(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi
const SECRET_PAIR = new RegExp(
  `((?:${SECRET_KEY})\\s*["']?\\s*[:=]\\s*["']?)([^"'&\\s,}]+)`,
  'gi',
)

export function redact(value: string): string {
  return value.replace(CREDENTIALS, '$1***@').replace(SECRET_PAIR, '$1***')
}

/** Keeps the local part short and the domain intact: `jane.doe@lab.edu` → `j***@lab.edu`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@')
  if (at <= 0) return '***'
  return `${email[0]}***${email.slice(at)}`
}

function render(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${redact(value.message)}`
  if (typeof value === 'string') return redact(value)
  try {
    return redact(JSON.stringify(value) ?? String(value))
  } catch {
    return '[unserializable]'
  }
}

function emit(write: (line: string) => void, message: string, meta: unknown[]) {
  write([redact(message), ...meta.map(render)].join(' '))
}

export const log = {
  info(message: string, ...meta: unknown[]) {
    emit((line) => console.log(line), message, meta)
  },
  warn(message: string, ...meta: unknown[]) {
    emit((line) => console.warn(line), message, meta)
  },
  error(message: string, ...meta: unknown[]) {
    emit((line) => console.error(line), message, meta)
  },
  /** Prints without redaction. Only for values the operator asked to see. */
  verbatim(message: string) {
    console.log(message)
  },
}
