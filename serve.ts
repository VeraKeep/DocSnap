// Production server for the built site. The TanStack Start build emits a portable
// fetch handler (dist/server/server.js) plus static client assets (dist/client);
// this wraps them in a Bun server on port 3000 — static files first, API routes
// next, SSR for the rest. Run `bun run build` before starting. Restart it with
// `bun run publish`.
//
// API routes (/api/*) are handled directly by importing their source handlers.
// This bypasses TanStack Start's file-based routing which excludes "-" prefixed
// files from both the client build and the route tree.
//
// Starting a new instance supersedes the old one: it frees the port no matter
// which user owns the current server.
import handler from "./dist/server/server.js";

// API route handlers (these use "-" prefix so they're excluded from TanStack Start)
import { POST as stripePOST } from "./src/routes/api/-stripe-webhook";
import { GET as uploadGET, POST as uploadPOST } from "./src/routes/api/-uploadthing";
import {
  POST as sharePOST,
  GET as shareGET,
  DELETE as shareDELETE,
  GET_LIST as sharesGET,
} from "./src/routes/api/-share";

const PORT = 3000;
const HOST = "0.0.0.0";
const CLIENT_DIR = `${import.meta.dir}/dist/client`;

const freePort =
  `for _ in $(seq 1 25); do ` +
  `pids=$(lsof -t -iTCP:${String(PORT)} -sTCP:LISTEN 2>/dev/null || true); ` +
  `if [ -z "$pids" ]; then exit 0; fi; ` +
  `kill $pids 2>/dev/null || true; sleep 0.2; ` +
  `done`;

for (let attempt = 1; ; attempt++) {
  await Bun.$`sudo sh -c ${freePort}`.quiet().nothrow();
  try {
    Bun.serve({
      port: PORT,
      hostname: HOST,
      async fetch(req) {
        const { pathname } = new URL(req.url);

        // API routes — handle before static files or SSR.
        if (pathname === "/api/stripe-webhook" && req.method === "POST") {
          return stripePOST(req);
        }
        if (pathname === "/api/uploadthing") {
          if (req.method === "GET") return uploadGET(req);
          if (req.method === "POST") return uploadPOST(req);
        }
        // Share links — create, access, revoke, list.
        if (pathname === "/api/share" && req.method === "POST") {
          return sharePOST(req);
        }
        if (pathname === "/api/shares" && req.method === "GET") {
          return sharesGET(req);
        }
        const shareMatch = pathname.match(/^\/api\/share\/([^/]+)$/);
        if (shareMatch) {
          if (req.method === "GET") return shareGET(req, shareMatch[1]);
          if (req.method === "DELETE") return shareDELETE(req, shareMatch[1]);
        }

        // Static files.
        if (pathname !== "/") {
          const file = Bun.file(CLIENT_DIR + pathname);
          if (await file.exists()) return new Response(file);
        }

        // SSR fallback.
        return (
          handler as { fetch: (r: Request) => Response | Promise<Response> }
        ).fetch(req);
      },
    });
    break;
  } catch (err) {
    if (attempt >= 10) throw err;
    await Bun.sleep(200);
  }
}

console.log(`team-site serving on http://${HOST}:${String(PORT)}`);
