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
 *
 * REQUEST PLUMBING (TanStack Start 1.168/1.169): in this version the handler's
 * `opts.context` is typed `undefined` and carries no Request — the server
 * functions handler receives `{ request, context, serverFnId }` as separate
 * params (start-server-core/dist/esm/server-functions-handler.js:11). The
 * framework instead exposes the current fetch Request through the
 * request-scoped storage context: createStartHandler wraps every server-fn
 * invocation in `runWithStartContext({ request, ... }, ...)` with
 * handlerType "serverFn" (start-server-core/dist/esm/createStartHandler.js:
 * 264-277), and `getStartContext()` (from @tanstack/start-storage-context,
 * an AsyncLocalStorage) returns it — typed `request: Request` in
 * StartStorageContext. That is the supported mechanism this version provides;
 * `opts.context` is deliberately ignored.
 */
import { getAuth } from "@clerk/tanstack-start/server";
import { getStartContext } from "@tanstack/start-storage-context";

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
 * The current fetch Request is pulled from the framework's request-scoped
 * storage context (set for every server-fn invocation by createStartHandler).
 * An optional `context` param is accepted for forward-compatibility with
 * versions that carry the Request in the handler context, but it is not
 * required. Returns the Clerk `userId` or throws a 401 Response — TanStack
 * Start surfaces a thrown Response as-is (server-functions-handler.js:180),
 * so anonymous and misconfigured calls get a real 401, never a fallback
 * identity.
 */
export async function requireServerFunctionUser(context?: {
  request?: unknown;
}): Promise<string> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  const publishableKey = process.env.CLERK_PUBLISHABLE_KEY;
  // Preferred: the Request TanStack Start stores for the current server-fn
  // invocation. Fallback: a caller-supplied request, if a future framework
  // version exposes it via the handler context.
  const request =
    context?.request ?? getStartContext({ throwIfNotFound: false })?.request;
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
