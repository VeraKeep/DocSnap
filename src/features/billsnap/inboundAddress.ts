/**
 * BillSnap — per-user inbound email address enrollment (Part A of the inbound
 * email transport).
 *
 * When an owner turns on "email in", we generate a unique, unguessable token
 * and assign them an inbound address of the form:
 *
 *     bills+<token>@<BILLSNAP_INBOUND_DOMAIN>
 *
 * The token is stored normalized in the DB, scoped to the owner's
 * clerk_user_id. A provider webhook (see src/routes/api/-billsnap-email-inbound)
 * extracts the token from the `to` recipient and uses resolveOwnerFromRecipient
 * to map it back to the owning Clerk user — so a forwarded bill lands in the
 * right owner's scope without trusting anything from the sender.
 *
 * The token is the ONLY secret here; the domain itself is public. Revocation is
 * simply deleting the row (the address stops resolving), and rotation replaces
 * the token with a fresh one. Fail-closed throughout: unknown/malformed tokens
 * resolve to null, never to a guessed owner.
 *
 * Persistence style matches the rest of the module: a dedicated owner-scoped
 * table (see db-schema.sql) queried through the same `sql` helper as bills.
 */
import { sql } from "~/db";
import { randomBytes } from "node:crypto";

/** The domain our inbound addresses live on (env-overridable, e.g. a subdomain
 *  that must have an inbound‑parse route configured at the provider). */
export function inboundDomain(): string {
  return process.env.BILLSNAP_INBOUND_DOMAIN ?? "inbound.docsnapapp.com";
}

/** Full inbound address for a token, e.g. bills+<token>@inbound.docsnapapp.com. */
export function inboundAddressForToken(token: string): string {
  return `bills+${token}@${inboundDomain()}`;
}

/**
 * Generate a fresh unguessable token: 24 random bytes base64url-encoded ->
 * 32 chars (>= the 16+ requirement), URL-safe (no '+' '/' '=') so it survives
 * being a path/query token. Server-only module, so Node crypto is safe here.
 */
export function generateInboundToken(): string {
  return randomBytes(24).toString("base64url");
}

const TOKEN_PATTERN = /^[A-Za-z0-9_-]{16,}$/;

/** Normalize a recipient header/full address to its local+domain tokens. */
export interface ParsedRecipient {
  /** The local part, lowercased (e.g. "bills+abc123"). */
  local: string;
  /** The lowercase domain (without the trailing dot). */
  domain: string;
  /** The token if the local part is of the form bills+<token>. */
  token: string | null;
  /** True when the whole address parses (has '@' and a non-empty local). */
  ok: boolean;
}

/**
 * Parse and normalize an RFC-5322 recipient. Strips display names and angle
 * brackets (e.g. `"John" <Bills+AbC@Inbound.DocSnapApp.com>`), lowercases, and
 * splits it into local + domain + token. Returns ok:false for anything that
 * isn't a bare address.
 */
export function parseRecipient(recipient: string): ParsedRecipient {
  if (!recipient) return { local: "", domain: "", token: null, ok: false };
  // Take the last angle-bracketed address if present, else the whole string.
  const angle = recipient.match(/<([^<>]+)>/);
  const raw = ((angle ? angle[1] : recipient) || "").trim();
  const at = raw.lastIndexOf("@");
  if (at <= 0) return { local: "", domain: "", token: null, ok: false };
  const local = raw.slice(0, at).toLowerCase();
  const domain = raw.slice(at + 1).toLowerCase().replace(/\.$/, "");
  if (!local) return { local: "", domain: "", token: null, ok: false };
  let token: string | null = null;
  const plus = local.indexOf("+");
  if (plus >= 0) {
    const candidate = local.slice(plus + 1);
    if (TOKEN_PATTERN.test(candidate)) token = candidate;
  }
  return { local, domain, token, ok: true };
}

/** True when the local part uses the reserved `bills+` prefix. */
export function isBillSnapRecipient(recipient: string): boolean {
  return parseRecipient(recipient).local.startsWith("bills+");
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

export interface InboundAddressRow {
  clerkUserId: string;
  token: string;
  enabled: boolean;
}

/**
 * Enable "email in" for an owner: generate (or keep) a token and persist the
 * owner↔token mapping. Returns the owner's current inbound address. If a token
 * already exists for the user it is returned unchanged (enable is idempotent);
 * call rotate to get a fresh one.
 */
export async function enableBillSnapEmailIn(clerkUserId: string): Promise<{
  ok: boolean;
  code: "enabled" | "error";
  token?: string;
  address?: string;
  message: string;
}> {
  if (!clerkUserId) {
    return { ok: false, code: "error", message: "Missing owner id." };
  }
  try {
    const existing = await sql`
      SELECT token FROM billsnap_inbound_addresses
      WHERE clerk_user_id = ${clerkUserId} LIMIT 1
    `;
    const current = existing[0]?.token as string | undefined;
    if (current && TOKEN_PATTERN.test(current)) {
      return {
        ok: true,
        code: "enabled",
        token: current,
        address: inboundAddressForToken(current),
        message: "Email-in is already enabled — using the existing address.",
      };
    }
    const token = generateInboundToken();
    await sql`
      INSERT INTO billsnap_inbound_addresses (clerk_user_id, token, enabled)
      VALUES (${clerkUserId}, ${token}, true)
      ON CONFLICT (clerk_user_id)
      DO UPDATE SET token = ${token}, enabled = true, updated_at = NOW()
    `;
    return {
      ok: true,
      code: "enabled",
      token,
      address: inboundAddressForToken(token),
      message: "Email-in enabled — a private inbound address was assigned for your bills.",
    };
  } catch (error) {
    console.error("[billsnap] Failed to enable email-in:", error);
    return { ok: false, code: "error", message: "Could not enable email-in right now." };
  }
}

/** Read the owner's current inbound address (without creating one). */
export async function getBillSnapEmailIn(clerkUserId: string): Promise<{
  ok: boolean;
  enabled: boolean;
  token?: string;
  address?: string;
}> {
  try {
    const rows = await sql`
      SELECT token, enabled FROM billsnap_inbound_addresses
      WHERE clerk_user_id = ${clerkUserId} LIMIT 1
    `;
    const token = rows[0]?.token as string | undefined;
    const enabled = rows[0]?.enabled === true;
    if (!token || !enabled) return { ok: true, enabled: false };
    return { ok: true, enabled: true, token, address: inboundAddressForToken(token) };
  } catch (error) {
    console.error("[billsnap] Failed to read email-in status:", error);
    return { ok: false, enabled: false };
  }
}

/**
 * Rotate the owner's inbound token (e.g. because it leaked). Revokes the old
 * token (the previous address stops resolving) and assigns a fresh one.
 */
export async function rotateBillSnapEmailIn(clerkUserId: string): Promise<{
  ok: boolean;
  code: "rotated" | "error";
  token?: string;
  address?: string;
  message: string;
}> {
  if (!clerkUserId) {
    return { ok: false, code: "error", message: "Missing owner id." };
  }
  try {
    const token = generateInboundToken();
    await sql`
      INSERT INTO billsnap_inbound_addresses (clerk_user_id, token, enabled)
      VALUES (${clerkUserId}, ${token}, true)
      ON CONFLICT (clerk_user_id)
      DO UPDATE SET token = ${token}, enabled = true, updated_at = NOW()
    `;
    return {
      ok: true,
      code: "rotated",
      token,
      address: inboundAddressForToken(token),
      message: "Your inbound address was rotated — the old one no longer resolves.",
    };
  } catch (error) {
    console.error("[billsnap] Failed to rotate email-in token:", error);
    return { ok: false, code: "error", message: "Could not rotate your inbound address." };
  }
}

/** Disable/revoke email-in for an owner (their address stops resolving). */
export async function disableBillSnapEmailIn(clerkUserId: string): Promise<{
  ok: boolean;
  code: "disabled" | "error";
  message: string;
}> {
  if (!clerkUserId) {
    return { ok: false, code: "error", message: "Missing owner id." };
  }
  try {
    await sql`DELETE FROM billsnap_inbound_addresses WHERE clerk_user_id = ${clerkUserId}`;
    return { ok: true, code: "disabled", message: "Email-in is off — your inbound address no longer works." };
  } catch (error) {
    console.error("[billsnap] Failed to disable email-in:", error);
    return { ok: false, code: "error", message: "Could not disable email-in right now." };
  }
}

/**
 * Look up the owner's clerk_user_id from a raw token (the provider webhook
 * path). Returns null when the token is unknown, malformed, or the mapping has
 * been revoked/disabled — never a guessed value (fail closed).
 */
export async function lookupClerkUserByInboundToken(token: string): Promise<string | null> {
  if (!token || !TOKEN_PATTERN.test(token)) return null;
  try {
    const rows = await sql`
      SELECT clerk_user_id FROM billsnap_inbound_addresses
      WHERE token = ${token} AND enabled = true LIMIT 1
    `;
    const clerkUserId = rows[0]?.clerk_user_id as string | undefined;
    return clerkUserId && clerkUserId.length > 0 ? clerkUserId : null;
  } catch (error) {
    console.error("[billsnap] Failed to look up inbound token:", error);
    return null;
  }
}

/**
 * Resolve the owning clerk_user_id from a recipient address (the `to` field of
 * an inbound email). Returns null when the recipient isn't a BillSnap inbound
 * address or its token doesn't map to an enabled owner.
 */
export async function resolveOwnerFromRecipient(
  recipient: string,
): Promise<{ clerkUserId: string | null; token: string | null; domain: string | null }> {
  const parsed = parseRecipient(recipient);
  if (!parsed.ok || !parsed.local.startsWith("bills+") || !parsed.token) {
    return { clerkUserId: null, token: parsed.token ?? null, domain: parsed.domain || null };
  }
  const clerkUserId = await lookupClerkUserByInboundToken(parsed.token);
  return { clerkUserId, token: parsed.token, domain: parsed.domain || null };
}
