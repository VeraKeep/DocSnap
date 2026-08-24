/**
 * Waitlist — public early-access capture for DocSnap.
 *
 * This is the first step of growing a real user base so we have someone to
 * launch/announce HomeSnap to. It is a pure interest/early-access capture: it
 * writes ONE row (email + created_at) into the shared `waitlist` table and
 * NEVER creates a DocSnap account, NEVER grants any add-on, and never touches
 * the `users` table. It is intentionally unauthenticated and public — anyone
 * arriving at the landing page can add their email.
 *
 * Hardening:
 *   - Validation: email must be non-empty and match a sane address shape.
 *     Normalized (trimmed + lowercased) so `User@X.com` and `user@x.com`
 *     dedupe to the same row.
 *   - Dedupe: the `waitlist.email` column is UNIQUE and the insert uses
 *     `ON CONFLICT (email) DO NOTHING`; we also pre-check so we can return a
 *     friendly "already on the list" message. No duplicate rows ever.
 *   - Anti-spam: a lightweight in-memory rate limit keyed by client IP
 *     (x-forwarded-for / cf-connecting-ip) caps submissions per hour. This is
 *     per warm server instance (fine for our traffic) and complements the
 *     UNIQUE dedupe so the same address can't be hammered.
 *
 * Uses the shared Neon connection helper (`~/db`) and the host schema
 * (`src/db-schema.sql`), same server-action pattern as the other modules.
 */
import { createServerFn } from "@tanstack/react-start";
import { getStartContext } from "@tanstack/start-storage-context";
import { sql } from "~/db";

/** Matches typical email addresses; rejects strings with spaces/no `@`/no TLD. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export type WaitlistResult = { status: "added" | "already" | "rate_limited" | "unconfigured"; message: string };

// ── Lightweight in-memory rate limiter (per warm instance) ─────────────
const MAX_PER_HOUR = 5;
const WINDOW_MS = 60 * 60 * 1000;
const hitsByIp = new Map<string, number[]>();
setInterval(() => {
  const now = Date.now();
  for (const [ip, times] of hitsByIp) {
    const recent = times.filter((t) => now - t < WINDOW_MS);
    if (recent.length === 0) hitsByIp.delete(ip);
    else hitsByIp.set(ip, recent);
  }
}, WINDOW_MS).unref?.();

function clientIp(request?: Request): string | null {
  if (!request) return null;
  const viaForwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const viaCf = request.headers.get("cf-connecting-ip")?.trim();
  return (viaForwarded || viaCf || null);
}

export const joinWaitlist = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { email?: unknown };
    if (typeof d.email !== "string" || d.email.trim().length === 0) {
      throw new Error("Enter your email address.");
    }
    const email = d.email.trim().toLowerCase();
    if (!EMAIL_RE.test(email)) {
      throw new Error("That email doesn't look right — please double-check it.");
    }
    return { email };
  })
  .handler(async ({ data }): Promise<WaitlistResult> => {
    const context = getStartContext({ throwIfNotFound: false });
    const ip = clientIp(context?.request);

    // Anti-spam: cap submissions per IP per hour.
    if (ip) {
      const now = Date.now();
      const recent = (hitsByIp.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
      if (recent.length >= MAX_PER_HOUR) {
        return {
          status: "rate_limited",
          message: "Thanks for your interest! We've received a lot of signups from this device — try again a little later.",
        };
      }
      recent.push(now);
      hitsByIp.set(ip, recent);
    }

    if (!process.env.DATABASE_URL) {
      return { status: "unconfigured", message: "Signups aren't connected yet — please try again a little later." };
    }

    // Friendly dedupe pre-check (the UNIQUE constraint is the real guard).
    const existing = (await sql`SELECT 1 FROM waitlist WHERE email = ${data.email}`) as unknown[];
    if (existing.length > 0) {
      return { status: "already", message: "You're already on the list — we'll be in touch." };
    }

    await sql`INSERT INTO waitlist (email) VALUES (${data.email}) ON CONFLICT (email) DO NOTHING`;
    return { status: "added", message: "You're on the list — we'll be in touch." };
  });
