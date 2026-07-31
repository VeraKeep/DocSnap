/**
 * Neon Postgres database connection.
 *
 * Uses @neondatabase/serverless for edge-compatible SQL queries.
 * Falls back to a no-op mock when DATABASE_URL is not configured.
 */

import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;

// Real SQL client when database is configured.
const realSql = databaseUrl ? neon(databaseUrl) : null;

// Query builder that works whether DATABASE_URL is set or not.
// When unset, returns empty results for reads and silently succeeds for writes.
function sql(
  strings: TemplateStringsArray,
  ...values: unknown[]
): Promise<Record<string, unknown>[]> {
  if (realSql) {
    try {
      return realSql(strings, ...values) as Promise<Record<string, unknown>[]>;
    } catch (err) {
      console.error("[db] Query error:", err);
      return Promise.resolve([]);
    }
  }

  // No-op fallback: return empty results, log a warning once.
  if (!sql._warned) {
    console.warn(
      "[db] DATABASE_URL not set — database calls will return empty results.",
    );
    sql._warned = true;
  }
  return Promise.resolve([]);
}
sql._warned = false;

export { sql };
