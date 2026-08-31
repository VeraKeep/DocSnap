import { createUploadthing, type FileRouter } from "uploadthing/server";

const f = createUploadthing();

export const uploadRouter = {
  pdfUploader: f({
    pdf: {
      maxFileSize: "32MB",
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      // This runs on the server before upload
      return {};
    })
    .onUploadComplete(async ({ file }) => {
      // Called after upload completes
      return { fileKey: file.key, fileUrl: file.ufsUrl };
    }),
  /**
   * MeetingSnap audio uploads — one audio/video recording (mp3, wav, m4a,
   * mp4, webm), max 25MB. Capped at 25MB to stay under OpenAI Whisper's
   * 25MB request limit (the uploaded file is fetched back and re-posted to
   * `/v1/audio/transcriptions` server-side). `audio` covers the audio-only
   * types; `video/mp4` (and mp4 containers) are allowed because Whisper
   * accepts mp4 recordings. Served by the same `/api/uploadthing` route
   * handler; the client selects the entry with `?slug=audioUploader`.
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
    .middleware(async () => {
      // This runs on the server before upload
      return {};
    })
    .onUploadComplete(async ({ file }) => {
      // Called after upload completes
      return { fileKey: file.key, fileUrl: file.ufsUrl };
    }),
  /**
   * GarageSnap workshop/equipment photo uploads — one image, max 8MB
   * (mirrors the GarageSnap prototype's constraints). Served by the same
   * `/api/uploadthing` route handler as pdfUploader; the client selects the
   * entry with `?slug=imageUploader`.
   */
  imageUploader: f({
    image: {
      maxFileSize: "8MB",
      maxFileCount: 1,
    },
  })
    .middleware(async () => {
      // This runs on the server before upload
      return {};
    })
    .onUploadComplete(async ({ file }) => {
      // Called after upload completes
      return { fileKey: file.key, fileUrl: file.ufsUrl };
    }),
} satisfies FileRouter;

export type UploadRouter = typeof uploadRouter;
