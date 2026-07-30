import { generateReactHelpers } from "@uploadthing/react";
import type { UploadRouter } from "./uploadthing";

const { useUploadThing } = generateReactHelpers<UploadRouter>();

export { useUploadThing };

/**
 * Upload a PDF blob to Uploadthing.
 * Returns upload result or null on failure.
 * Only call this when the user is signed in and env vars are configured.
 */
export async function uploadPDFBlob(
  blob: Blob,
  fileName: string,
): Promise<{ fileKey: string; fileUrl: string } | null> {
  // Create form data for the upload
  const formData = new FormData();

  // We need to use the uploadthing endpoint directly
  // First, get the presigned URL by calling the route handler
  try {
    // The uploadthing flow: routeHandler gives us presigned POST info
    // We use the client-side uploadthing helpers

    // Since we can't use the hook outside React, we do a direct upload
    // via the uploadthing API route

    // Prepare the file
    const file = new File([blob], fileName, { type: "application/pdf" });

    // Call our API route to initiate upload
    const initRes = await fetch("/api/uploadthing?actionType=upload&slug=pdfUploader", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: [{ name: file.name, size: file.size, type: file.type }],
      }),
    });

    if (!initRes.ok) {
      console.error("Upload init failed:", await initRes.text());
      return null;
    }

    const initData = await initRes.json() as {
      data: Array<{
        key: string;
        url: string;
        fields: Record<string, string>;
      }>;
    };

    if (!initData.data || initData.data.length === 0) {
      return null;
    }

    const presigned = initData.data[0];

    // Upload to presigned URL
    const uploadFormData = new FormData();
    for (const [k, v] of Object.entries(presigned.fields)) {
      uploadFormData.append(k, v);
    }
    uploadFormData.append("file", file);

    const uploadRes = await fetch(presigned.url, {
      method: "POST",
      body: uploadFormData,
    });

    if (!uploadRes.ok) {
      console.error("Upload failed:", await uploadRes.text());
      return null;
    }

    const fileUrl = `https://utfs.io/f/${presigned.key}`;
    return { fileKey: presigned.key, fileUrl };
  } catch (err) {
    console.error("Upload error:", err);
    return null;
  }
}
