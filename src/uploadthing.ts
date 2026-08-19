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
