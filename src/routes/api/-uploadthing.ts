import { createRouteHandler } from "uploadthing/server";
import { uploadRouter } from "../../uploadthing";

// SINGLE UploadThing credential path (app-wide): UPLOADTHING_SECRET is the
// canonical env var — the one set in the deploy environment and the one every
// other UploadThing consumer uses (cloudStorage.ts / assetStorage.ts config
// detection + UTApi deletion). We prefer it here for the route handler so the
// whole app keys off one credential. UPLOADTHING_TOKEN is kept only as a
// backward-compatible fallback so any legacy deploy that set only
// UPLOADTHING_TOKEN keeps working. NOTE: the v7 token is a base64-encoded JSON
// object ({ apiKey, appId, regions }) — store it as the raw value with no
// "UPLOADTHING_TOKEN=" prefix and no surrounding quotes (the deployed secret is
// clean; we read it verbatim).
const uploadThingToken =
  process.env.UPLOADTHING_SECRET ?? process.env.UPLOADTHING_TOKEN ?? "";

const handler = createRouteHandler({
  router: uploadRouter,
  config: {
    token: uploadThingToken,
    // Tie dev-mode upload behavior to the environment: never run isDev in
    // production. import.meta.env.DEV matches the app's existing dev-detection
    // idiom (RouteErrorBoundary/errorLogger) and is resolved at build time.
    isDev: import.meta.env.DEV,
  },
});

export async function GET(request: Request) {
  if (!uploadThingToken) {
    return new Response(JSON.stringify({ error: "Uploadthing not configured" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }
  return handler(request);
}

export async function POST(request: Request) {
  if (!uploadThingToken) {
    return new Response(JSON.stringify({ error: "Uploadthing not configured" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }
  return handler(request);
}
