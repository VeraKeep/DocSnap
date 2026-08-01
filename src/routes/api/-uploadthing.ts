import { createRouteHandler } from "uploadthing/server";
import { uploadRouter } from "../../uploadthing";

const handler = createRouteHandler({
  router: uploadRouter,
  config: {
    token: process.env.UPLOADTHING_SECRET,
    isDev: true,
  },
});

export async function GET(request: Request) {
  if (!process.env.UPLOADTHING_SECRET) {
    return new Response(JSON.stringify({ error: "Uploadthing not configured" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }
  return handler(request);
}

export async function POST(request: Request) {
  if (!process.env.UPLOADTHING_SECRET) {
    return new Response(JSON.stringify({ error: "Uploadthing not configured" }), {
      status: 501,
      headers: { "Content-Type": "application/json" },
    });
  }
  return handler(request);
}
