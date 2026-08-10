/**
 * ReceiptSnap module — server functions (step 1: auth contract spike).
 *
 * Minimal protected server function proving the server auth adapter resolves
 * an authenticated Clerk identity for ReceiptSnap server functions. Anonymous
 * calls (or an unconfigured Clerk) fail closed with HTTP 401 — see
 * src/lib/server-auth.ts. The full owner-scoped receipt data layer replaces
 * this file in the next step.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireServerFunctionUser } from "~/lib/server-auth";

/**
 * Resolves the current caller's Clerk user ID from the server session.
 * Identity comes ONLY from the auth adapter — the client cannot influence it.
 */
export const whoAmI = createServerFn({ method: "GET" }).handler(
  async (opts: { context: { request?: unknown } }) => {
    const userId = await requireServerFunctionUser(opts.context);
    return { userId };
  },
);
