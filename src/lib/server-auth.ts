/**
 * Server-side Clerk identity adapter for TanStack Start server functions.
 *
 * DocSnap's existing server functions accept a client-supplied `userId` /
 * `clerkUserId` (see src/subscription.ts, src/cloudStorage.ts). ReceiptSnap
 * must not copy that pattern: receipt rows are personal purchase data, so the
 * owner identity is established HERE on the server from the Clerk session and
 * any caller-supplied owner ID is ignored.
 *
 * WHY NOT @clerk/tanstack-start's getAuth: its loadOptions() calls vinxi's
 * getEvent() (via commonEnvs -> getPublicEnvVariables), which reads
 * `globalThis.app.config` — a nitro/vinxi runtime context that THIS app never
 * establishes in any deployment (serve.ts, vercel-entry.ts, and the sandbox
 * temp server all call dist/server/server.js's portable fetch handler
 * directly; the built bundle contains no nitro bootstrap). getEvent() throws
 * `undefined is not an object (evaluating 'globalThis.app.config')`, so the
 * documented getAuth primitive is unusable in this app and would 401 every
 * request, signed in or not. The same vinxi dependency blocks the lower-level
 * authenticateRequest() helpers in the installed @clerk/backend build.
 *
 * So the session token is verified here directly against Clerk's JWKS
 * (RS256 signature + exp/nbf/iss claims), using only platform primitives
 * (fetch + WebCrypto). The token is a real Clerk-issued `__session` JWT; the
 * userId is read from its `sub` claim. Fails closed — when Clerk is not
 * configured, the request shape is wrong, or no identity can be resolved,
 * the server function is rejected with HTTP 401 and the same opaque message.
 * An identity is never guessed, defaulted, or accepted from the client.
 *
 * NOTE: this verifies token validity (signature/claims), not live session
 * revocation. A revoked-but-unexpired token would still pass. That matches
 * the short (60s) lifetime of Clerk session tokens in practice; revisit if
 * server-side session revocation becomes a requirement.
 *
 * REQUEST PLUMBING (TanStack Start 1.168/1.169): the handler's `opts.context`
 * is typed `undefined` and carries no Request — the framework instead exposes
 * the current fetch Request through the request-scoped storage context:
 * createStartHandler wraps every server-fn invocation in
 * `runWithStartContext({ request, ... }, ...)` and `getStartContext()` (from
 * @tanstack/start-storage-context, an AsyncLocalStorage) returns it.
 */
import { getStartContext } from "@tanstack/start-storage-context";

const AUTHENTICATION_UNAVAILABLE = "Authentication is unavailable";
const JWKS_TTL_MS = 10 * 60 * 1000; // Clerk keys rotate rarely; cache 10 min.

let jwksCache: { keys: { kid: string; kty: string; n: string; e: string; alg?: string }[] } | null = null;
let jwksFetchedAt = 0;

function isRequestLike(value: unknown): value is Request {
  return (
    !!value &&
    typeof (value as Request).url === "string" &&
    typeof (value as Request).headers?.get === "function"
  );
}

/** Decode the Clerk instance host from a publishable key (pk_test_<b64>$). */
function frontendApiUrlFromPublishableKey(publishableKey: string): string {
  const part = publishableKey.split("_").pop() ?? "";
  const decoded = Buffer.from(part, "base64").toString("utf8").replace(/\$$/, "");
  return `https://${decoded}`;
}

function b64urlToBytes(value: string): Uint8Array {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (value.length % 4)) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

async function fetchJwks(frontendApiUrl: string) {
  const now = Date.now();
  if (jwksCache && now - jwksFetchedAt < JWKS_TTL_MS) return jwksCache;
  const res = await fetch(`${frontendApiUrl}/.well-known/jwks.json`);
  if (!res.ok) throw new Error("JWKS fetch failed");
  jwksCache = (await res.json()) as typeof jwksCache;
  jwksFetchedAt = now;
  return jwksCache;
}

/** Verifies a Clerk `__session` JWT against Clerk's JWKS; returns the userId. */
async function verifyClerkSessionToken(token: string, publishableKey: string): Promise<string> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Malformed token");
  const [headerB64, payloadB64, signatureB64] = parts;
  const header = JSON.parse(new TextDecoder().decode(b64urlToBytes(headerB64))) as { kid?: string; alg?: string };
  const payload = JSON.parse(new TextDecoder().decode(b64urlToBytes(payloadB64))) as {
    sub?: string; iss?: string; exp?: number; nbf?: number;
  };
  if (!header.kid || !payload.sub) throw new Error("Missing kid/sub");
  if (header.alg !== "RS256") throw new Error("Unexpected alg");

  const nowSec = Math.floor(Date.now() / 1000);
  if (typeof payload.exp === "number" && nowSec > payload.exp) throw new Error("Token expired");
  if (typeof payload.nbf === "number" && nowSec < payload.nbf) throw new Error("Token not yet valid");

  const frontendApiUrl = frontendApiUrlFromPublishableKey(publishableKey);
  if (payload.iss && payload.iss !== frontendApiUrl) throw new Error("Issuer mismatch");

  const jwks = await fetchJwks(frontendApiUrl);
  const key = jwks?.keys.find((k) => k.kid === header.kid);
  if (!key) throw new Error("Unknown key id");

  const publicKey = await crypto.subtle.importKey(
    "jwk",
    { kty: key.kty, n: key.n, e: key.e, alg: key.alg ?? "RS256", use: "sig" },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    publicKey,
    b64urlToBytes(signatureB64) as BufferSource,
    new TextEncoder().encode(`${headerB64}.${payloadB64}`),
  );
  if (!valid) throw new Error("Bad signature");
  return payload.sub;
}

/**
 * Resolves the authenticated Clerk user for a TanStack Start server function.
 * Returns the Clerk `userId` or throws a 401 Response — TanStack Start
 * surfaces a thrown Response as-is, so anonymous and misconfigured calls get
 * a real 401, never a fallback identity.
 */
export async function requireServerFunctionUser(context?: {
  request?: unknown;
}): Promise<string> {
  const secretKey = process.env.CLERK_SECRET_KEY;
  // The publishable key is public; it is read here as a config gate so the
  // adapter fails closed when Clerk isn't fully configured.
  const publishableKey =
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ??
    process.env.CLERK_PUBLISHABLE_KEY;
  const request =
    context?.request ?? getStartContext({ throwIfNotFound: false })?.request;
  if (!secretKey || !publishableKey || !isRequestLike(request)) {
    throw new Response(AUTHENTICATION_UNAVAILABLE, { status: 401 });
  }
  const token = request.headers.get("cookie")?.match(/(?:^|;\s*)__session=([^;]+)/)?.[1];
  if (!token) {
    throw new Response(AUTHENTICATION_UNAVAILABLE, { status: 401 });
  }
  try {
    const userId = await verifyClerkSessionToken(token, publishableKey);
    return userId;
  } catch (error) {
    if (error instanceof Response) throw error;
    throw new Response(AUTHENTICATION_UNAVAILABLE, { status: 401 });
  }
}
