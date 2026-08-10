/**
 * Server-side Clerk identity adapter for TanStack Start server functions.
 *
 * DocSnap's existing server functions accept a client-supplied `userId` /
 * `clerkUserId` (see src/subscription.ts, src/cloudStorage.ts). ReceiptSnap
 * must not copy that pattern: receipt rows are personal purchase data, so the
 * owner identity is established HERE on the server from the Clerk session and
 * any caller-supplied owner ID is ignored.
 *
 * Uses the documented @clerk/tanstack-start server primitive:
 * `getAuth(request, { secretKey })` verifies the session token and resolves
 * the authenticated user. Fails closed — when Clerk is not configured, the
 * request shape is wrong, or no identity can be resolved, the server function
 * is rejected with HTTP 401 and the same opaque message. An identity is never
 * guessed, defaulted, or accepted from the client.
 */
import { getAuth } from "@clerk/tanstack-start/server";

const AUTHENTICATION_UNAVAILABLE = "Authentication is unavailable";

function isRequestLike(value: unknown): value is Request {
  return (
    !!value &&
    typeof (value as Request).url === "string" &&
    typeof (value as Request).headers?.get === "function"
  );
}

/**
 * Resolves the authenticated Clerk user for a TanStack Start server function.
 *
 * Pass the handler's `context` (which carries the original fetch `request`)
 * into this function. Returns the Clerk `userId` or throws a 401 Response —
 * TanStack Start surfaces a thrown Response as-is, so anonymous and
 * misconfigured calls get a real 401, never a fallback identity.
 */
export async function requireServerFunctionUser(context: {
  request?: unknown;
}): Promise<string> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
  const request = context?.request;
  if (!secretKey || !publishableKey || !isRequestLike(request)) {
    throw new Response(AUTHENTICATION_UNAVAILABLE, { status: 401 });
  }
  try {
    const auth = await getAuth(request, { secretKey });
    if (!auth.userId) {
      throw new Response(AUTHENTICATION_UNAVAILABLE, { status: 401 });
    }
    return auth.userId;
  } catch (error) {
    // Re-throw our own 401 unchanged; anything else (bad token, upstream
    // Clerk failure) also fails closed with the same opaque 401.
    if (error instanceof Response) throw error;
    throw new Response(AUTHENTICATION_UNAVAILABLE, { status: 401 });
  }
}
