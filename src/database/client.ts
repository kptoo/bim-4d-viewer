import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

// ── Connection string ────────────────────────────────────────────────────────

function getDatabaseUrl(): string {
  const url = import.meta.env.VITE_NEON_DATABASE_URL as string | undefined

  if (!url || url.trim().length === 0) {
    throw new Error(
      '[database/client] VITE_NEON_DATABASE_URL is not set.\n' +
      'Create a .env.local file with VITE_NEON_DATABASE_URL=<your neon connection string>.'
    )
  }

  return url.trim()
}

// ── Lazy singleton ───────────────────────────────────────────────────────────

let _sql: NeonQueryFunction<false, false> | null = null

function getClient(): NeonQueryFunction<false, false> {
  if (!_sql) {
    _sql = neon(getDatabaseUrl())
  }
  return _sql
}

/**
 * Tagged template literal SQL executor.
 *
 * @example
 * const rows = await sql`SELECT * FROM information_layers`
 * const rows = await sql`SELECT * FROM information_layers WHERE id = ${id}`
 */
export async function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const client = getClient()
  // neon() returns a tagged template function whose return type is
  // Promise<QueryResult[]>. We cast to T[] for clean consumer types.
  const result = await client(strings, ...values)
  return result as unknown as T[]
}

/**
 * Checks whether the database connection is healthy.
 * Useful for a startup connectivity probe.
 */
export async function ping(): Promise<boolean> {
  try {
    await sql`SELECT 1`
    return true
  } catch {
    return false
  }
}