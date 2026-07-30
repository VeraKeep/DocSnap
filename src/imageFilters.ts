/**
 * imageFilters.ts
 * Pure client-side image enhancement filters for DocSnap.
 * All filters use canvas pixel manipulation — no new dependencies.
 */

export type FilterType = "auto" | "bw" | "grayscale" | "highContrast" | "receipt" | "color";

export const FILTER_LABELS: Record<FilterType, string> = {
  auto: "Auto",
  bw: "B&W",
  grayscale: "Grayscale",
  highContrast: "High Contrast",
  receipt: "Receipt",
  color: "Color",
};

export const ALL_FILTERS: FilterType[] = [
  "auto",
  "bw",
  "grayscale",
  "highContrast",
  "receipt",
  "color",
];

/** Load an image from a data URL. */
function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for filter"));
    img.src = url;
  });
}

/**
 * Apply a filter to an image (given as a data URL) and return a new data URL.
 * "auto" and "color" are no-ops — they return the source unchanged.
 */
export async function applyFilter(
  sourceUrl: string,
  filter: FilterType,
): Promise<string> {
  if (filter === "auto" || filter === "color") {
    return sourceUrl;
  }

  const img = await loadImage(sourceUrl);

  // Downscale large images for performance (max 2400px on longest side)
  const maxDim = 2400;
  let w = img.naturalWidth;
  let h = img.naturalHeight;
  const scale = Math.min(1, maxDim / Math.max(w, h));
  w = Math.round(w * scale);
  h = Math.round(h * scale);

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);

  let result: ImageData;
  switch (filter) {
    case "bw":
      result = applyAdaptiveThreshold(imageData);
      break;
    case "grayscale":
      result = applyGrayscale(imageData);
      break;
    case "highContrast":
      result = applyHighContrast(imageData);
      break;
    case "receipt":
      result = applyReceipt(imageData);
      break;
    default:
      return sourceUrl;
  }

  ctx.putImageData(result, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.92);
}

/**
 * Get the base source URL for a given filter type.
 * - "color" → original image
 * - everything else → processed image (or original if no processed available)
 */
export function getSourceForFilter(
  original: string,
  processed: string | null,
  filter: FilterType,
): string {
  if (filter === "color") return original;
  return processed || original;
}

// ─── Filter implementations ────────────────────────────────────────────

/**
 * Adaptive threshold (Black & White).
 * Uses an integral image to compute local mean in a window,
 * then thresholds each pixel against its local neighborhood.
 * Window radius of 15px handles uneven lighting well.
 */
function applyAdaptiveThreshold(src: ImageData): ImageData {
  const { data, width, height } = src;
  const dst = new ImageData(width, height);
  const dstData = dst.data;
  const RADIUS = 15;
  const C = 10; // constant subtracted from mean (higher = more black)

  // Compute grayscale values first
  const gray = new Float32Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    gray[i] = data[off] * 0.299 + data[off + 1] * 0.587 + data[off + 2] * 0.114;
  }

  // Build integral image for fast window sums
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y++) {
    let rowSum = 0;
    for (let x = 1; x <= width; x++) {
      rowSum += gray[(y - 1) * width + (x - 1)];
      integral[y * (width + 1) + x] =
        integral[(y - 1) * (width + 1) + x] + rowSum;
    }
  }

  function windowSum(x1: number, y1: number, x2: number, y2: number): number {
    const a = integral[y1 * (width + 1) + x1];
    const b = integral[y1 * (width + 1) + x2];
    const c = integral[y2 * (width + 1) + x1];
    const d = integral[y2 * (width + 1) + x2];
    return d - b - c + a;
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const off = i * 4;

      // Window bounds clamped to image edges
      const x1 = Math.max(0, x - RADIUS);
      const y1 = Math.max(0, y - RADIUS);
      const x2 = Math.min(width, x + RADIUS + 1);
      const y2 = Math.min(height, y + RADIUS + 1);
      const area = (x2 - x1) * (y2 - y1);

      const mean = windowSum(x1, y1, x2, y2) / area;

      // Pixel darker than local mean - C → black, else white
      const pixel = gray[i];
      const val = pixel < mean - C ? 0 : 255;

      dstData[off] = val;
      dstData[off + 1] = val;
      dstData[off + 2] = val;
      dstData[off + 3] = 255;
    }
  }

  return dst;
}

/**
 * Perceptual grayscale.
 * Uses standard luminance weights: 0.299R + 0.587G + 0.114B.
 */
function applyGrayscale(src: ImageData): ImageData {
  const { data, width, height } = src;
  const dst = new ImageData(width, height);
  const dstData = dst.data;

  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    const gray = Math.round(
      data[off] * 0.299 + data[off + 1] * 0.587 + data[off + 2] * 0.114,
    );
    dstData[off] = gray;
    dstData[off + 1] = gray;
    dstData[off + 2] = gray;
    dstData[off + 3] = data[off + 3];
  }

  return dst;
}

/**
 * High Contrast — contrast stretch.
 * Maps the darkest 2% of pixels to 0 and the brightest 2% to 255,
 * then stretches everything in between linearly.
 * Applied per-channel for maximum effect.
 */
function applyHighContrast(src: ImageData): ImageData {
  const { data, width, height } = src;
  const dst = new ImageData(width, height);
  const dstData = dst.data;
  const totalPixels = width * height;

  // Build histograms per channel
  function buildHistogram(channelOffset: number): Int32Array {
    const hist = new Int32Array(256);
    for (let i = 0; i < totalPixels; i++) {
      hist[data[i * 4 + channelOffset]]++;
    }
    return hist;
  }

  function findPercentile(hist: Int32Array, percentile: number): number {
    const target = totalPixels * percentile;
    let cumulative = 0;
    for (let i = 0; i < 256; i++) {
      cumulative += hist[i];
      if (cumulative >= target) return i;
    }
    return percentile < 0.5 ? 0 : 255;
  }

  const histR = buildHistogram(0);
  const histG = buildHistogram(1);
  const histB = buildHistogram(2);

  const loR = findPercentile(histR, 0.02);
  const hiR = findPercentile(histR, 0.98);
  const loG = findPercentile(histG, 0.02);
  const hiG = findPercentile(histG, 0.98);
  const loB = findPercentile(histB, 0.02);
  const hiB = findPercentile(histB, 0.98);

  function stretch(value: number, lo: number, hi: number): number {
    if (hi <= lo) return value;
    const stretched = ((value - lo) / (hi - lo)) * 255;
    return Math.max(0, Math.min(255, Math.round(stretched)));
  }

  for (let i = 0; i < totalPixels; i++) {
    const off = i * 4;
    dstData[off] = stretch(data[off], loR, hiR);
    dstData[off + 1] = stretch(data[off + 1], loG, hiG);
    dstData[off + 2] = stretch(data[off + 2], loB, hiB);
    dstData[off + 3] = data[off + 3];
  }

  return dst;
}

/**
 * Receipt filter — optimized for thermal paper receipts.
 * Steps:
 *  1. Convert to grayscale with a slight warm tint
 *  2. Apply unsharp mask for sharpening
 *  3. Boost contrast via a gentle S-curve
 */
function applyReceipt(src: ImageData): ImageData {
  const { data, width, height } = src;
  const dst = new ImageData(width, height);
  const dstData = dst.data;

  // Step 1: Grayscale with warm tint
  const gray = new Float32Array(width * height);
  const r = new Float32Array(width * height);
  const g = new Float32Array(width * height);
  const b = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const off = i * 4;
    r[i] = data[off];
    g[i] = data[off + 1];
    b[i] = data[off + 2];
    gray[i] = r[i] * 0.299 + g[i] * 0.587 + b[i] * 0.114;
  }

  // Step 2: Unsharp mask
  // Blur the grayscale image with a 5x5 box blur
  const blurred = boxBlur(gray, width, height, 2);

  // Subtract blurred from original to get the detail layer, then add back (amount = 1.5)
  const amount = 1.5;
  const threshold = 2; // ignore small differences (noise)
  const sharpened = new Float32Array(width * height);

  for (let i = 0; i < width * height; i++) {
    const diff = gray[i] - blurred[i];
    if (Math.abs(diff) >= threshold) {
      sharpened[i] = gray[i] + amount * diff;
    } else {
      sharpened[i] = gray[i];
    }
  }

  // Step 3: S-curve contrast boost + warm tint
  for (let i = 0; i < width * height; i++) {
    const off = i * 4;

    // Clamp sharpened value
    let v = Math.max(0, Math.min(255, sharpened[i])) / 255;

    // S-curve: enhances midtones
    // f(x) = 1 / (1 + ((1-x)/x)^2)   — logistic-ish
    if (v > 0.001 && v < 0.999) {
      const odds = (1 - v) / v;
      v = 1 / (1 + odds * odds * 1.5);
    }

    const out = Math.round(v * 255);

    // Warm tint: slightly boost red, slightly reduce blue
    const wr = Math.min(255, Math.round(out * 1.05));
    const wg = out;
    const wb = Math.max(0, Math.round(out * 0.92));

    dstData[off] = wr;
    dstData[off + 1] = wg;
    dstData[off + 2] = wb;
    dstData[off + 3] = 255;
  }

  return dst;
}

/**
 * Simple separable box blur on a single-channel Float32Array.
 * Radius is the half-width of the box (window = 2*radius + 1).
 */
function boxBlur(
  src: Float32Array,
  width: number,
  height: number,
  radius: number,
): Float32Array {
  const tmp = new Float32Array(width * height);
  const dst = new Float32Array(width * height);

  // Horizontal pass
  for (let y = 0; y < height; y++) {
    const rowStart = y * width;
    let windowSum = 0;

    // Initialize window
    for (let x = 0; x <= radius && x < width; x++) {
      windowSum += src[rowStart + x];
    }
    for (let x = radius + 1; x < width && x <= 2 * radius; x++) {
      windowSum += src[rowStart + x];
    }

    for (let x = 0; x < width; x++) {
      const left = x - radius - 1;
      const right = x + radius;
      if (left >= 0) windowSum -= src[rowStart + left];
      if (right < width) windowSum += src[rowStart + right];

      const count =
        Math.min(right, width - 1) - Math.max(left + 1, 0) + 1;
      tmp[rowStart + x] = windowSum / count;
    }
  }

  // Vertical pass
  for (let x = 0; x < width; x++) {
    let windowSum = 0;

    for (let y = 0; y <= radius && y < height; y++) {
      windowSum += tmp[y * width + x];
    }
    for (let y = radius + 1; y < height && y <= 2 * radius; y++) {
      windowSum += tmp[y * width + x];
    }

    for (let y = 0; y < height; y++) {
      const top = y - radius - 1;
      const bottom = y + radius;
      if (top >= 0) windowSum -= tmp[top * width + x];
      if (bottom < height) windowSum += tmp[bottom * width + x];

      const count =
        Math.min(bottom, height - 1) - Math.max(top + 1, 0) + 1;
      dst[y * width + x] = windowSum / count;
    }
  }

  return dst;
}
