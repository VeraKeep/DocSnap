import { createUploadthing, type FileRouter } from "uploadthing/server";
import { getVerifiedUserId } from "./serverAuth";
import { getUserEntitlementSummaryForUser } from "./subscription";
import { gateUpload, type UploadGateResult } from "./uploadAuth";

const f = createUploadthing();

/**
 * Run an uploader's middleware body with a shared reject helper.
 *
 * Every uploader first verifies the Clerk session from the upload `Request`,
 * then (for the module uploaders) checks the live-DB entitlement owned by that
 * verified user. FAILS CLOSED: an unauthenticated caller or a caller lacking
 * the required entitlement throws BEFORE any bytes are accepted, so they can
 * never consume UploadThing storage/bandwidth. On success the middleware
 * returns a user/entitlement label that `onUploadComplete` may reference.
 */
function unauthorized(reason: UploadGateResult["reason"], kind: string): never {
  throw new Error(
    `${kind} upload rejected: ${
      reason === "not-signed-in" ? "not signed in" : "entitlement required"
    }`,
  );
}

/**
 * Resolve an uploader's gate result and either return the metadata object for
 * `onUploadComplete` or throw (reject) the upload.
 */
function resolveGate(kind: string, result: UploadGateResult) {
  if (!result.ok) unauthorized(result.reason, kind);
  return {
    uploadedBy: result.uploadedBy!,
    entitlement: result.entitlement!,
  };
}

export const uploadRouter = {
  /**
   * Cloud document PDF uploads. The DocSnap cloud-sync UI (`useCloudSync`
   * `saveToCloud`) allows any SIGNED-IN user to save a scanned document to
   * the cloud (there is no paid-tier gate in the UI today), so this uploader
   * gates on auth only — matching the UI exactly. Unauthenticated callers are
   * rejected before any file is accepted.
   */
  pdfUploader: f({
    pdf: {
      maxFileSize: "32MB",
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req }) => {
      const userId = await getVerifiedUserId(req);
      const decision = gateUpload({ userId, kind: "pdf" });
      return resolveGate("pdfUploader", decision);
    })
    .onUploadComplete(async ({ file, metadata }) => {
      return {
        fileKey: file.key,
        fileUrl: file.ufsUrl,
        uploadedBy: metadata.uploadedBy,
        entitlement: metadata.entitlement,
      };
    }),
  /**
   * MeetingSnap audio uploads — one audio/video recording (mp3, wav, m4a,
   * mp4, webm), max 25MB. Capped at 25MB to stay under OpenAI Whisper's
   * 25MB request limit (the uploaded file is fetched back and re-posted to
   * `/v1/audio/transcriptions` server-side). `audio` covers the audio-only
   * types; `video/mp4` (and mp4 containers) are allowed because Whisper
   * accepts mp4 recordings. Served by the same `/api/uploadthing` route
   * handler; the client selects the entry with `?slug=audioUploader`.
   *
   * GATE: only users who own MeetingSnap at a PAID tier (meetingsnap !==
   * "free") may upload, read live from the DB so it reflects what the user
   * ACTUALLY owns. Fails closed for anonymous/free users.
   */
  audioUploader: f({
    audio: {
      maxFileSize: "25MB" as any,
      maxFileCount: 1,
    },
    "video/mp4": {
      maxFileSize: "25MB" as any,
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req }) => {
      const userId = await getVerifiedUserId(req);
      const entitlementOk = userId
        ? (await getUserEntitlementSummaryForUser(userId)).meetingsnap !== "free"
        : false;
      const decision = gateUpload({ userId, entitlementOk, kind: "audio" });
      return resolveGate("audioUploader", decision);
    })
    .onUploadComplete(async ({ file, metadata }) => {
      return {
        fileKey: file.key,
        fileUrl: file.ufsUrl,
        uploadedBy: metadata.uploadedBy,
        entitlement: metadata.entitlement,
      };
    }),
  /**
   * GarageSnap workshop/equipment photo uploads — one image, max 8MB
   * (mirrors the GarageSnap prototype's constraints). Served by the same
   * `/api/uploadthing` route handler as pdfUploader; the client selects the
   * entry with `?slug=imageUploader`.
   *
   * GATE: only users entitled to GarageSnap (addon_garagesnap) may upload,
   * read live from the DB. Fails closed for anonymous/non-owners.
   */
  imageUploader: f({
    image: {
      maxFileSize: "8MB",
      maxFileCount: 1,
    },
  })
    .middleware(async ({ req }) => {
      const userId = await getVerifiedUserId(req);
      const entitlementOk = userId
        ? (await getUserEntitlementSummaryForUser(userId)).garagesnap
        : false;
      const decision = gateUpload({ userId, entitlementOk, kind: "image" });
      return resolveGate("imageUploader", decision);
    })
    .onUploadComplete(async ({ file, metadata }) => {
      return {
        fileKey: file.key,
        fileUrl: file.ufsUrl,
        uploadedBy: metadata.uploadedBy,
        entitlement: metadata.entitlement,
      };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
