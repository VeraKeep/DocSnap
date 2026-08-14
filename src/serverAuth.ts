/**
 * Server-side Clerk session verification.
 *
 * Every server code path that acts on a user's data must derive the user id
 * from the verified Clerk session — NEVER from client-supplied values
 * (e.g. a `userId` in the request body, query string, or headers). A
 * client-supplied id can be forged by any attacker who knows/guesses another
 * user's id, letting them read, delete, or modify that user's documents.
 *
 * `getAuth(request)` verifies the Clerk session (JWT + secret key) and
 * returns the authenticated user's id, or null when the caller is not signed
 * in.
 */
import { getAuth } from "@clerk/tanstack-start/server";
import { getRequest } from "@tanstack/react-start/server";

/**
 * Returns the verified Clerk user id for the current request, or null when
 * the caller is not authenticated.
 *
 * Inside a `createServerFn` handler, call with no argument — the current
 * request is fetched from the TanStack Start request context. In a plain
 * route handler (e.g. the `/api/share/*` handlers in serve.ts), pass the
 * incoming `Request` explicitly.
 */
export async function getVerifiedUserId(
  req?: Request,
): Promise<string | null> {
  const request = req ?? getRequest();
  const auth = await getAuth(request);
  return auth.userId ?? null;
}
