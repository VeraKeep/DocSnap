// Vercel Build Output API function entry.
//
// The Build Output Node launcher invokes the default export as a classic Node
// `(req, res)` handler — NOT a web handler. TanStack Start emits a portable web
// fetch handler (dist/server/server.js), so we adapt: Node IncomingMessage → web
// Request, run the fetch handler, stream the web Response back onto ServerResponse.
// Node 22 has global Request/Response/Headers/ReadableStream.
//
// Bundled (with its deps + the SSR handler's dynamic ./assets chunks) into
// .vercel/output/functions/render.func/index.mjs by build-vercel.sh.
import type { IncomingMessage, ServerResponse } from "node:http";

import handler from "./dist/server/server.js";

// API route handlers that serve.ts mounts directly (TanStack Start excludes
// "-" prefixed files from its route tree). On Vercel there is no serve.ts: this
// single function receives every path on the domain, so the Stripe webhook is
// mounted here (below) to make real checkout purchases auto-grant entitlements
// in production. Everything else still falls through to the SSR handler.
import { POST as stripePOST } from "./src/routes/api/-stripe-webhook";
// BillSnap email ingestion — machine endpoint (secret-gated). Mounted here the
// same way as the Stripe webhook: config.json routes every path to this one
// function, so the ingest path must be intercepted inside this entry to reach
// the handler (see the mount below).
import {
  POST as billsnapIngestPOST,
  GET as billsnapIngestGET,
} from "./src/routes/api/-billsnap-email-ingest";

const fetchHandler = handler as {
  fetch: (request: Request) => Response | Promise<Response>;
};

const toWebRequest = (req: IncomingMessage): Request => {
  const host = req.headers.host ?? "localhost";
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined) ?? "https";
  const url = `${proto}://${host}${req.url ?? "/"}`;
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) for (const v of value) headers.append(key, v);
    else if (value != null) headers.set(key, value);
  }
  const method = req.method ?? "GET";
  const hasBody = method !== "GET" && method !== "HEAD";
  return new Request(url, {
    method,
    headers,
    ...(hasBody
      ? { body: req as unknown as ReadableStream, duplex: "half" }
      : {}),
  } as RequestInit);
};

/** Writes a web Response (status/headers/streamed body) to a Node response. */
async function streamResponse(
  res: ServerResponse,
  webRes: Response,
): Promise<void> {
  res.statusCode = webRes.status;
  webRes.headers.forEach((value, key) => res.setHeader(key, value));
  if (webRes.body) {
    const reader = webRes.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
  }
  res.end();
}

export default async function vercelHandler(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  try {
    const webRequest = toWebRequest(req);

    // Mount the Stripe webhook and BillSnap email ingestion here: config.json
    // routes EVERY path on the domain to this one function (single render.func,
    // no per-path rewrite), so these API paths must be intercepted inside this
    // entry for callers to reach them. Every other path falls through to SSR.
    const isStripeWebhook =
      req.method === "POST" && webRequest.url.endsWith("/api/stripe-webhook");
    const isBillSnapIngest =
      webRequest.url.endsWith("/api/billsnap-email-ingest") &&
      (req.method === "POST" || req.method === "GET");

    if (isStripeWebhook) {
      await streamResponse(res, await stripePOST(webRequest));
      return;
    }
    if (isBillSnapIngest) {
      const ingestRes =
        req.method === "GET"
          ? await billsnapIngestGET()
          : await billsnapIngestPOST(webRequest);
      await streamResponse(res, ingestRes);
      return;
    }

    const webRes = await fetchHandler.fetch(webRequest);
    await streamResponse(res, webRes);
  } catch (error) {
    // Log the detail server-side (captured by the host's function logs); never
    // return a stack trace to the public visitor of the site.
    console.error("[team-site] SSR request failed", error);
    res.statusCode = 500;
    res.setHeader("content-type", "text/plain");
    res.end("Internal Server Error");
  }
}
