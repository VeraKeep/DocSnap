/**
 * SecureVault connection store — Neon-backed, keyed by the DocSnap Clerk user.
 *
 * OPT-IN CONNECTED IDENTITY (owner decision): a DocSnap user (Clerk) may
 * explicitly connect their SecureVault (Supabase) account. On connect we store
 * the SecureVault bearer token SERVER-SIDE, mapped to their `clerk_user_id`,
 * so later "Save to Vault" actions can forward a document on their behalf
 * without the browser ever holding the token again.
 *
 * SECURITY INVARIANTS (non-negotiable):
 *   - The SecureVault access token is only ever stored server-side, returned
 *     to the client in a connect response, or used server-side to call
 *     SecureVault's ingest endpoint. The DocSnap client never reads it back.
 *   - We never log the token, never put it in the bundle, and never return it
 *     after save.
 *   - Default off: nothing touches SecureVault until the user explicitly
 *     connects AND explicitly taps "Save to Vault".
 *
 * NOTE ON AT-REST ENCRYPTION: like the rest of DocSnap's Neon data, this is
 * stored in plaintext columns in Neon (TLS in transit). At-rest encryption of
 * the token (e.g. an app-level AES key or Neon's pgcrypto) is a follow-up;
 * the value is scoped to the row and never exposed to the client. See
 * docs/docsnap-securevault-integration.md.
 */
import { sql } from "../db";

/** A stored SecureVault connection for one DocSnap user. */
export interface SecureVaultConnection {
  clerkUserId: string;
  /** The SecureVault (Supabase) access token — server-side ONLY. */
  accessToken: string;
  /** Optional refresh token for transparent re-auth when the access token expires. */
  refreshToken: string | null;
  /** ISO timestamp when the access token expires (refreshed proactively). */
  expiresAt: string | null;
  /** The resolved SecureVault/Supabase user id (informational, for audit). */
  vaultUserId: string | null;
  createdAt: string;
}

function rowToConnection(row: Record<string, unknown>): SecureVaultConnection {
  return {
    clerkUserId: String(row.clerk_user_id),
    accessToken: String(row.access_token),
    refreshToken: row.refresh_token != null ? String(row.refresh_token) : null,
    expiresAt: row.expires_at != null ? String(row.expires_at) : null,
    vaultUserId: row.vault_user_id != null ? String(row.vault_user_id) : null,
    createdAt: row.created_at != null ? String(row.created_at) : "",
  };
}

/** Fetch the stored connection for a Clerk user, or null if none exists. */
export async function getConnection(
  clerkUserId: string,
): Promise<SecureVaultConnection | null> {
  const rows = await sql`
    SELECT clerk_user_id, access_token, refresh_token, expires_at,
           vault_user_id, created_at
    FROM securevault_connections
    WHERE clerk_user_id = ${clerkUserId}
    LIMIT 1
  `;
  if (!rows.length) return null;
  return rowToConnection(rows[0]);
}

/** Insert or replace the connection for a Clerk user. */
export async function saveConnection(input: {
  clerkUserId: string;
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: string | null;
  vaultUserId?: string | null;
}): Promise<boolean> {
  try {
    await sql`
      INSERT INTO securevault_connections
        (clerk_user_id, access_token, refresh_token, expires_at, vault_user_id)
      VALUES
        (${input.clerkUserId}, ${input.accessToken},
         ${input.refreshToken ?? null}, ${input.expiresAt ?? null},
         ${input.vaultUserId ?? null})
      ON CONFLICT (clerk_user_id) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = EXCLUDED.refresh_token,
        expires_at = EXCLUDED.expires_at,
        vault_user_id = EXCLUDED.vault_user_id,
        updated_at = NOW()
    `;
    // With DATABASE_URL unset, `sql()` no-ops to [] and returns true here so
    // the connect flow still resolves without a DB in dev.
    return true;
  } catch (err) {
    console.error("[securevault] saveConnection failed", err);
    return false;
  }
}

/** Remove the connection for a Clerk user (disconnect). */
export async function deleteConnection(clerkUserId: string): Promise<boolean> {
  try {
    await sql`
      DELETE FROM securevault_connections
      WHERE clerk_user_id = ${clerkUserId}
    `;
    return true;
  } catch (err) {
    console.error("[securevault] deleteConnection failed", err);
    return false;
  }
}

/** True when the connection's access token has already expired. */
export function isConnectionExpired(conn: SecureVaultConnection): boolean {
  if (!conn.expiresAt) return false;
  const t = Date.parse(conn.expiresAt);
  if (Number.isNaN(t)) return false;
  return Date.now() >= t;
}
