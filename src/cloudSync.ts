import { generateReactHelpers } from "@uploadthing/react";
import type { UploadRouter } from "./uploadthing";

const { useUploadThing } = generateReactHelpers<UploadRouter>();

export { useUploadThing };

/**
 * A single UploadThing v7 presigned upload descriptor. The live `/api/uploadthing`
 * route returns a TOP-LEVEL array of these (`[{url,key,name,customId}]`); older
 * shapes wrapped them in `{ data: [...] }` and included a `fields` map (S3 presigned
 * POST). Only `url` (the ingest endpoint) and `key` (used to derive the public URL)
 * are actually needed for v7.
 */
interface UtPresigned {
  url?: string;
  key?: string;
  name?: string;
  customId?: string | null;
}

const UPLOADTHING_CLIENT_VERSION = "7.7.4";

/**
 * Manual client-side UploadThing v7 upload: request a presigned URL from our
 * `/api/uploadthing` route, then PUT the file to the returned ingest `url` as a
 * single multipart part named `file`.
 *
 * The two things that were wrong before this fix:
 *  1. The response shape. v7 returns a top-level array `[{url,key,name,customId}]`
 *     (no `data` wrapper, no `fields`). The old code read `data[0].fields` and
 *     would find neither.
 *  2. The HTTP method. v7's ingest endpoint ONLY accepts `PUT` to the presigned
 *     URL with `multipart/form-data` (POST returns `404 Route POST:/<key> not
 *     found`; a non-multipart body returns `415 Unsupported Media Type`). The old
 *     code did a `POST` and always failed.
 *
 * Returns `{ fileKey, fileUrl }` on success or `null` on any failure (callers
 * keep their existing fallback behavior).
 */
async function uploadFileToUploadThing(
  file: File,
  slug: string,
): Promise<{ fileKey: string; fileUrl: string } | null> {
  try {
    // Step 1: ask our route handler to presign an upload for this file.
    const initRes = await fetch(
      `/api/uploadthing?actionType=upload&slug=${encodeURIComponent(slug)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          files: [{ name: file.name, size: file.size, type: file.type }],
        }),
      },
    );

    if (!initRes.ok) {
      console.error(`Upload init failed (${slug}):`, await initRes.text());
      return null;
    }

    const payload = (await initRes.json()) as unknown;
    // v7 returns a top-level array; tolerate the legacy `{ data: [...] }` shape.
    const list: UtPresigned[] | undefined = Array.isArray(payload)
      ? (payload as UtPresigned[])
      : (payload as { data?: UtPresigned[] })?.data;

    if (!Array.isArray(list) || list.length === 0 || !list[0]?.url || !list[0]?.key) {
      console.error(`Upload presign returned no usable entry (${slug}).`);
      return null;
    }

    const { url, key } = list[0];

    // Step 2: PUT the file to the presigned ingest URL as multipart part "file".
    const uploadFormData = new FormData();
    uploadFormData.append("file", file);

    const uploadRes = await fetch(url, {
      method: "PUT",
      headers: {
        // v7 uploads are ranged/resumable; a full upload starts at byte 0.
        Range: "bytes=0-",
        "x-uploadthing-version": UPLOADTHING_CLIENT_VERSION,
      },
      body: uploadFormData,
    });

    if (!uploadRes.ok) {
      console.error(`Upload to ingest failed (${slug}):`, await uploadRes.text());
      return null;
    }

    // Step 3: the file is retrievable from the public CDN at this URL.
    return { fileKey: key, fileUrl: `https://utfs.io/f/${key}` };
  } catch (err) {
    console.error("Upload error:", err);
    return null;
  }
}

/**
 * Upload a PDF blob to Uploadthing.
 * Returns upload result or null on failure.
 * Only call this when the user is signed in and env vars are configured.
 */
export async function uploadPDFBlob(
  blob: Blob,
  fileName: string,
): Promise<{ fileKey: string; fileUrl: string } | null> {
  const file = new File([blob], fileName, { type: "application/pdf" });
  return uploadFileToUploadThing(file, "pdfUploader");
}

/**
 * Upload an asset photo (workshop tool / equipment) to UploadThing using the
 * same manual presigned flow as `uploadPDFBlob`, with the GarageSnap
 * `imageUploader` slug (one image, max 8MB). The `/api/uploadthing` endpoint
 * serves both router entries, so this only changes the `slug` query param.
 *
 * Returns null on failure (endpoint unreachable, 501 without
 * UPLOADTHING_SECRET, or an upload error) so the caller can fall back to
 * honest demo behavior.
 */
export async function uploadAssetImage(
  file: File,
): Promise<{ fileKey: string; fileUrl: string } | null> {
  return uploadFileToUploadThing(file, "imageUploader");
}

/**
 * Upload a MeetingSnap meeting recording (mp3/wav/m4a/mp4/webm) to UploadThing
 * using the same manual presigned flow as `uploadAssetImage`, with the
 * MeetingSnap `audioUploader` slug (one file, max 25MB — kept under Whisper's
 * 25MB request limit). The `/api/uploadthing` endpoint serves every router
 * entry, so this only changes the `slug` query param.
 *
 * Returns null on failure (endpoint unreachable, 501 without
 * UPLOADTHING_SECRET, or an upload error) so the caller can surface an honest,
 * friendly message instead of crashing.
 */
export async function uploadAudioRecording(
  file: File,
): Promise<{ fileKey: string; fileUrl: string } | null> {
  return uploadFileToUploadThing(file, "audioUploader");
}
