/**
 * database/client.ts — Neon PostgreSQL connection client.
 *
 * Provides a tagged template SQL executor built on the
 * @neondatabase/serverless driver.
 *
 * Design decisions:
 * - The `sql` function is a tagged template so all query parameters are
 *   automatically parameterised — no SQL injection risk.
 * - The client is a lazy singleton: the Neon connection is only created
 *   on the first SQL call, not at module load time. This avoids startup
 *   errors when the environment variable is not set during tests.
 * - `getDatabaseUrl()` throws a descriptive error if the env var is
 *   missing, which surfaces as a clear error message in the UI.
 *
 * Environment variables:
 *   VITE_NEON_DATABASE_URL — Neon connection string. Required in production.
 *   Format: postgres://user:password@host/database?sslmode=require
 *
 * @example
 * ```ts
 * // Select
 * const layers = await sql<LayerRow>`SELECT * FROM information_layers`
 *
 * // Select with parameter
 * const rows = await sql<LayerRow>`SELECT * FROM information_layers WHERE id = ${id}`
 *
 * // Insert
 * const [row] = await sql<ActivityRow>`
 *   INSERT INTO activities (name, start_date, end_date)
 *   VALUES (${name}, ${start}, ${end})
 *   RETURNING *
 * `
 * ```
 *
 * @module database/client
 */

import { neon, type NeonQueryFunction } from '@neondatabase/serverless'

// ── Connection string ──────────────────────────────────────────────────────────

/**
 * Reads the Neon database URL from the Vite environment.
 * Throws a descriptive error if the variable is missing.
 *
 * @throws Error when VITE_NEON_DATABASE_URL is not set
 * @returns The database connection string
 */
function getDatabaseUrl(): string {
  const url = import.meta.env.VITE_NEON_DATABASE_URL as string | undefined

  if (!url || url.trim().length === 0) {
    throw new Error(
      '[database/client] VITE_NEON_DATABASE_URL is not set.\n' +
      'Create a .env.local file with:\n' +
      '  VITE_NEON_DATABASE_URL=postgres://user:password@host/database?sslmode=require\n' +
      'See DEPLOYMENT.md for setup instructions.'
    )
  }

  return url.trim()
}

// ── Lazy singleton ─────────────────────────────────────────────────────────────

/** The Neon SQL client instance. Created on first use. */
let _sql: NeonQueryFunction<false, false> | null = null

/**
 * Returns the Neon SQL client, creating it on first access.
 * Subsequent calls return the same instance (singleton).
 *
 * @throws Error when VITE_NEON_DATABASE_URL is not configured
 */
function getClient(): NeonQueryFunction<false, false> {
  if (!_sql) {
    _sql = neon(getDatabaseUrl())
  }
  return _sql
}

// ── Tagged template SQL executor ───────────────────────────────────────────────

/**
 * Executes a parameterised SQL query using tagged template syntax.
 *
 * All interpolated values are treated as query parameters by the Neon
 * driver — they are never string-concatenated into the query text.
 *
 * @template T - The expected shape of each result row.
 *   For type safety, use the raw row types from `database/types.ts`.
 *
 * @param strings - Template string array (the SQL fragments)
 * @param values  - Template parameter values (bound as query parameters)
 * @returns Promise resolving to an array of typed rows
 *
 * @throws Error when the DB is unavailable, the query fails, or
 *   VITE_NEON_DATABASE_URL is not set. Callers should handle this
 *   via React Query's error state or explicit try/catch.
 *
 * @example
 * ```ts
 * const rows = await sql<LayerRow>`
 *   SELECT id, name FROM information_layers WHERE id = ${layerId}
 * `
 * ```
 */
export async function sql<T = Record<string, unknown>>(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<T[]> {
  const client = getClient()
  // The Neon driver's return type is Promise<QueryResult[]>.
  // We cast to T[] for clean consumer types.
  const result = await client(strings, ...values)
  return result as unknown as T[]
}

// ── Connection health check ────────────────────────────────────────────────────

/**
 * Executes a trivial query to verify the database connection is healthy.
 *
 * Useful for startup connectivity checks. Returns false instead of
 * throwing so callers can handle the failure gracefully.
 *
 * @returns Promise<boolean> — true if connected, false on any error
 */
export async function ping(): Promise<boolean> {
  try {
    await sql`SELECT 1`
    return true
  } catch {
    return false
  }
}