/**
 * thumbnail.ts
 * Generates low-resolution thumbnails for page strips.
 * Pure client-side — canvas-based, no dependencies.
 */

const THUMBNAIL_MAX_HEIGHT = 48;
const THUMBNAIL_QUALITY = 0.6;

/**
 * Generate a low-res thumbnail data URL from a full-resolution image URL.
 * Returns the original URL if generation fails.
 */
export async function generateThumbnail(imageUrl: string): Promise<string> {
  try {
    const img = await loadImage(imageUrl);
    const scale = THUMBNAIL_MAX_HEIGHT / img.naturalHeight;
    if (scale >= 1) return imageUrl; // Already small enough

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = THUMBNAIL_MAX_HEIGHT;

    const ctx = canvas.getContext("2d");
    if (!ctx) return imageUrl;

    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", THUMBNAIL_QUALITY);
  } catch {
    return imageUrl; // Fallback to original
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for thumbnail"));
    img.src = url;
  });
}
