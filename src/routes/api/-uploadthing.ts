import { createRouteHandler } from "uploadthing/server";
import { uploadRouter } from "../../uploadthing";

// UploadThing v7's route handler expects its cloud token (base64-encoded JSON
// { apiKey, appId, regions }) — the value uploadthing documents under
// `UPLOADTHING_TOKEN`. Prefer that variable. Fall back to `UPLOADTHING_SECRET`
// for legacy setups, tolerating a value that was pasted with a stray
// "UPLOADTHING_TOKEN=" prefix and/or a trailing quote (seen in the deployed
// env) so the credential still validates instead of failing with
// "Invalid token. A token is a base64 encoded JSON object...".
let uploadThingToken =
  process.env.UPLOADTHING_TOKEN ?? process.env.UPLOADTHING_SECRET ?? "";
uploadThingToken = uploadThingToken
  .replace(/^UPLOADTHING_TOKEN=/i, "")
  .replace(/[^A-Za-z0-9+/=]/g, "");

const handler = createRouteHandler({
  router: uploadRouter,
  config: {
    token: uploadThingToken,
    isDev: true,
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
