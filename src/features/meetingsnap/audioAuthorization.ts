import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_AUDIO_BYTES = 25 * 1024 * 1024;

function signingKey(): string {
  const key = process.env.UPLOADTHING_SECRET ?? process.env.UPLOADTHING_TOKEN;
  if (!key) throw new Error("Recording uploads are not configured.");
  return key;
}

/** Only the verified UploadThing completion callback issues these permits. */
export function authorizeAudioUpload(userId: string, fileUrl: string): string {
  validateAudioUrl(fileUrl);
  const payload = Buffer.from(JSON.stringify({ userId, fileUrl, expires: Date.now() + 3600000 })).toString("base64url");
  const signature = createHmac("sha256", signingKey()).update(`meetingsnap-audio:${payload}`).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyAudioUpload(token: string, userId: string, fileUrl: string): void {
  if (!token || token.length > 2048) throw new Error("Please upload the recording again.");
  const parts = token.split(".");
  if (parts.length !== 2) throw new Error("Invalid recording authorization.");
  const [payload, signature] = parts;
  const expected = createHmac("sha256", signingKey()).update(`meetingsnap-audio:${payload}`).digest();
  const actual = Buffer.from(signature, "base64url");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error("Invalid recording authorization.");
  }
  const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  if (claims.userId !== userId || claims.fileUrl !== fileUrl ||
      !Number.isFinite(claims.expires) || claims.expires <= Date.now()) {
    throw new Error("Recording authorization has expired or belongs to another upload.");
  }
  validateAudioUrl(fileUrl);
}

export function validateAudioUrl(fileUrl: string): void {
  const url = new URL(fileUrl);
  if (url.protocol !== "https:" || url.username || url.password || url.port || url.search || url.hash ||
      !(url.hostname === "utfs.io" || url.hostname.endsWith(".ufs.sh")) ||
      !/^\/f\/[A-Za-z0-9_-]+$/.test(url.pathname)) {
    throw new Error("A valid uploaded recording URL is required.");
  }
}

/** Bound actual downloaded bytes even when Content-Length is absent or false. */
export async function readAudioBytes(response: Response): Promise<Uint8Array> {
  if (Number(response.headers.get("content-length")) > MAX_AUDIO_BYTES) {
    await response.body?.cancel();
    throw new Error("Recording exceeds the 25 MB limit.");
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Recording is empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_AUDIO_BYTES) throw new Error("Recording exceeds the 25 MB limit.");
      chunks.push(value);
    }
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    reader.releaseLock();
  }
  if (!size) throw new Error("Recording is empty.");
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}
