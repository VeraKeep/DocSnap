/**
 * documentProcessor.ts
 * Pure client-side document edge detection, crop, and deskew.
 * No external dependencies — uses raw Canvas pixel manipulation.
 */

export interface Point {
  x: number;
  y: number;
}

export interface Quad {
  tl: Point;
  tr: Point;
  br: Point;
  bl: Point;
}

/**
 * Process a captured image: detect document edges, crop, and deskew.
 * Returns a data URL of the processed image, or null if detection fails.
 */
export function processDocument(
  imageData: ImageData,
  format: string = "image/jpeg",
  quality: number = 0.92,
): { dataUrl: string; quad: Quad } | null {
  const srcW = imageData.width;
  const srcH = imageData.height;

  // 1. Downscale for performance (max 600px on longest side)
  const maxDim = 600;
  const scale = Math.min(1, maxDim / Math.max(srcW, srcH));
  const sw = Math.floor(srcW * scale);
  const sh = Math.floor(srcH * scale);

  const smallData = downscaleImageData(imageData, sw, sh);

  // 2. Convert to grayscale
  const gray = toGrayscale(smallData, sw, sh);

  // 3. Edge detection (Sobel)
  const edges = sobelEdges(gray, sw, sh);

  // 4. Find document quadrilateral
  const quad = findDocumentQuad(edges, sw, sh);
  if (!quad) return null;

  // 5. Scale quad back to original coordinates
  const invScale = 1 / scale;
  const srcQuad: Quad = {
    tl: { x: quad.tl.x * invScale, y: quad.tl.y * invScale },
    tr: { x: quad.tr.x * invScale, y: quad.tr.y * invScale },
    br: { x: quad.br.x * invScale, y: quad.br.y * invScale },
    bl: { x: quad.bl.x * invScale, y: quad.bl.y * invScale },
  };

  // 6. Perspective warp
  const dataUrl = perspectiveWarp(imageData, srcW, srcH, srcQuad, format, quality);

  return { dataUrl, quad: srcQuad };
}

/**
 * Downscale ImageData to a new size using bilinear interpolation.
 */
function downscaleImageData(
  src: ImageData,
  dstW: number,
  dstH: number,
): ImageData {
  const dst = new ImageData(dstW, dstH);
  const srcData = src.data;
  const dstData = dst.data;
  const srcW = src.width;
  const srcH = src.height;
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      const sx = dx * xRatio;
      const sy = dy * yRatio;
      const sx0 = Math.floor(sx);
      const sy0 = Math.floor(sy);
      const sx1 = Math.min(sx0 + 1, srcW - 1);
      const sy1 = Math.min(sy0 + 1, srcH - 1);
      const fx = sx - sx0;
      const fy = sy - sy0;

      const di = (dy * dstW + dx) * 4;
      for (let c = 0; c < 4; c++) {
        const i00 = (sy0 * srcW + sx0) * 4 + c;
        const i10 = (sy0 * srcW + sx1) * 4 + c;
        const i01 = (sy1 * srcW + sx0) * 4 + c;
        const i11 = (sy1 * srcW + sx1) * 4 + c;

        const top = srcData[i00] * (1 - fx) + srcData[i10] * fx;
        const bottom = srcData[i01] * (1 - fx) + srcData[i11] * fx;
        dstData[di + c] = top * (1 - fy) + bottom * fy;
      }
    }
  }
  return dst;
}

/**
 * Convert ImageData to grayscale (single-channel Float32Array).
 */
function toGrayscale(
  src: ImageData,
  w: number,
  h: number,
): Float32Array {
  const gray = new Float32Array(w * h);
  const data = src.data;
  for (let i = 0; i < w * h; i++) {
    const off = i * 4;
    // Perceptual luminance weights
    gray[i] = data[off] * 0.299 + data[off + 1] * 0.587 + data[off + 2] * 0.114;
  }
  return gray;
}

/**
 * Sobel edge detection. Returns edge magnitude as Float32Array.
 */
function sobelEdges(
  gray: Float32Array,
  w: number,
  h: number,
): Float32Array {
  const edges = new Float32Array(w * h);

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = y * w + x;
      const tl = gray[(y - 1) * w + (x - 1)];
      const tc = gray[(y - 1) * w + x];
      const tr = gray[(y - 1) * w + (x + 1)];
      const ml = gray[y * w + (x - 1)];
      const mr = gray[y * w + (x + 1)];
      const bl = gray[(y + 1) * w + (x - 1)];
      const bc = gray[(y + 1) * w + x];
      const br = gray[(y + 1) * w + (x + 1)];

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br;
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br;

      edges[idx] = Math.sqrt(gx * gx + gy * gy);
    }
  }
  return edges;
}

/**
 * Find the document quadrilateral by scanning inward from each edge
 * and fitting lines to the document boundary.
 */
function findDocumentQuad(
  edges: Float32Array,
  w: number,
  h: number,
): Quad | null {
  // Adaptive threshold: median edge strength * 0.5
  const sorted = new Float32Array(edges.length);
  sorted.set(edges);
  sorted.sort();
  const medianEdge = sorted[Math.floor(sorted.length / 2)];
  const threshold = Math.max(medianEdge * 0.4, 15);

  // Scan from each direction to find boundary points
  const topPts = scanTopEdge(edges, w, h, threshold);
  const bottomPts = scanBottomEdge(edges, w, h, threshold);
  const leftPts = scanLeftEdge(edges, w, h, threshold);
  const rightPts = scanRightEdge(edges, w, h, threshold);

  // Need enough points from at least 3 sides
  const minPts = Math.min(w, h) * 0.05;
  const validSides = [
    topPts.length > minPts,
    bottomPts.length > minPts,
    leftPts.length > minPts,
    rightPts.length > minPts,
  ].filter(Boolean).length;

  if (validSides < 3) {
    console.log("Document detection failed: not enough valid sides");
    return null;
  }

  // Fit lines to boundary points
  const topLine = fitLine(topPts);
  const bottomLine = fitLine(bottomPts);
  const leftLine = fitLineVert(leftPts);
  const rightLine = fitLineVert(rightPts);

  if (!topLine || !bottomLine || !leftLine || !rightLine) {
    console.log("Document detection failed: line fitting");
   return null;
  }

  // Compute intersections (corners)
  // topLine & leftLine → tl
  // topLine & rightLine → tr
  // bottomLine & leftLine → bl
  // bottomLine & rightLine → br
  const tl = intersectLineLine(topLine, leftLine);
  const tr = intersectLineLine(topLine, rightLine);
  const bl = intersectLineLine(bottomLine, leftLine);
  const br = intersectLineLine(bottomLine, rightLine);

  if (!tl || !tr || !bl || !br) {
    console.log("Document detection failed: intersections");
    return null;
  }

  // Clamp corners to image bounds
  const clamp = (p: Point): Point => ({
    x: Math.max(0, Math.min(w - 1, Math.round(p.x))),
    y: Math.max(0, Math.min(h - 1, Math.round(p.y))),
  });

  const quad: Quad = {
    tl: clamp(tl),
    tr: clamp(tr),
    br: clamp(br),
    bl: clamp(bl),
  };

  // Validate: all points within reasonable bounds and form a proper quad
  if (!isValidQuad(quad, w, h)) {
    console.log("Document detection failed: invalid quad", quad);
    return null;
  }

  return quad;
}

/**
 * Scan from top edge downward to find document boundary.
 */
function scanTopEdge(
  edges: Float32Array,
  w: number,
  h: number,
  threshold: number,
): Point[] {
  const points: Point[] = [];
  const skipCols = Math.max(1, Math.floor(w / 100)); // sample every few cols

  for (let x = 0; x < w; x += skipCols) {
    for (let y = 0; y < h * 0.8; y++) {
      if (edges[y * w + x] > threshold) {
        // Confirm this is a real edge by checking neighbors
        let strongNeighbors = 0;
        const checkRadius = Math.max(1, Math.floor(w / 200));
        for (let dx = -checkRadius; dx <= checkRadius; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w && edges[y * w + nx] > threshold) {
            strongNeighbors++;
          }
        }
        if (strongNeighbors >= checkRadius + 1) {
          points.push({ x, y });
        }
        break;
      }
    }
  }
  return points;
}

/**
 * Scan from bottom edge upward to find document boundary.
 */
function scanBottomEdge(
  edges: Float32Array,
  w: number,
  h: number,
  threshold: number,
): Point[] {
  const points: Point[] = [];
  const skipCols = Math.max(1, Math.floor(w / 100));

  for (let x = 0; x < w; x += skipCols) {
    for (let y = h - 1; y > h * 0.2; y--) {
      if (edges[y * w + x] > threshold) {
        let strongNeighbors = 0;
        const checkRadius = Math.max(1, Math.floor(w / 200));
        for (let dx = -checkRadius; dx <= checkRadius; dx++) {
          const nx = x + dx;
          if (nx >= 0 && nx < w && edges[y * w + nx] > threshold) {
            strongNeighbors++;
          }
        }
        if (strongNeighbors >= checkRadius + 1) {
          points.push({ x, y });
        }
        break;
      }
    }
  }
  return points;
}

/**
 * Scan from left edge rightward to find document boundary.
 */
function scanLeftEdge(
  edges: Float32Array,
  w: number,
  h: number,
  threshold: number,
): Point[] {
  const points: Point[] = [];
  const skipRows = Math.max(1, Math.floor(h / 100));

  for (let y = 0; y < h; y += skipRows) {
    for (let x = 0; x < w * 0.8; x++) {
      if (edges[y * w + x] > threshold) {
        let strongNeighbors = 0;
        const checkRadius = Math.max(1, Math.floor(h / 200));
        for (let dy = -checkRadius; dy <= checkRadius; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < h && edges[ny * w + x] > threshold) {
            strongNeighbors++;
          }
        }
        if (strongNeighbors >= checkRadius + 1) {
          points.push({ x, y });
        }
        break;
      }
    }
  }
  return points;
}

/**
 * Scan from right edge leftward to find document boundary.
 */
function scanRightEdge(
  edges: Float32Array,
  w: number,
  h: number,
  threshold: number,
): Point[] {
  const points: Point[] = [];
  const skipRows = Math.max(1, Math.floor(h / 100));

  for (let y = 0; y < h; y += skipRows) {
    for (let x = w - 1; x > w * 0.2; x--) {
      if (edges[y * w + x] > threshold) {
        let strongNeighbors = 0;
        const checkRadius = Math.max(1, Math.floor(h / 200));
        for (let dy = -checkRadius; dy <= checkRadius; dy++) {
          const ny = y + dy;
          if (ny >= 0 && ny < h && edges[ny * w + x] > threshold) {
            strongNeighbors++;
          }
        }
        if (strongNeighbors >= checkRadius + 1) {
          points.push({ x, y });
        }
        break;
      }
    }
  }
  return points;
}

/**
 * Fit a horizontal-ish line (y = mx + b) using least squares.
 */
function fitLine(
  points: Point[],
): { m: number; b: number; horizontal: true } | null {
  if (points.length < 3) return null;

  // y = mx + b
  let sumX = 0, sumY = 0, sumXX = 0, sumXY = 0;
  const n = points.length;

  for (const p of points) {
    sumX += p.x;
    sumY += p.y;
    sumXX += p.x * p.x;
    sumXY += p.x * p.y;
  }

  const denom = n * sumXX - sumX * sumX;
  if (Math.abs(denom) < 1e-10) return null;

  const m = (n * sumXY - sumX * sumY) / denom;
  const b = (sumY * sumXX - sumX * sumXY) / denom;

  return { m, b, horizontal: true };
}

/**
 * Fit a vertical-ish line (x = my + b) using least squares.
 */
function fitLineVert(
  points: Point[],
): { m: number; b: number; horizontal: false } | null {
  if (points.length < 3) return null;

  // x = my + b
  let sumY = 0, sumX = 0, sumYY = 0, sumXY = 0;
  const n = points.length;

  for (const p of points) {
    sumY += p.y;
    sumX += p.x;
    sumYY += p.y * p.y;
    sumXY += p.y * p.x;
  }

  const denom = n * sumYY - sumY * sumY;
  if (Math.abs(denom) < 1e-10) return null;

  const m = (n * sumXY - sumY * sumX) / denom;
  const b = (sumX * sumYY - sumY * sumXY) / denom;

  return { m, b, horizontal: false };
}

/**
 * Intersect a horizontal line (y = m1*x + b1) with a vertical line (x = m2*y + b2).
 */
function intersectLineLine(
  hLine: { m: number; b: number; horizontal: true },
  vLine: { m: number; b: number; horizontal: false },
): Point | null {
  // hLine: y = hLine.m * x + hLine.b
  // vLine: x = vLine.m * y + vLine.b

  // Substitute: x = vLine.m * (hLine.m * x + hLine.b) + vLine.b
  // x = vLine.m * hLine.m * x + vLine.m * hLine.b + vLine.b
  // x * (1 - vLine.m * hLine.m) = vLine.m * hLine.b + vLine.b
  // x = (vLine.m * hLine.b + vLine.b) / (1 - vLine.m * hLine.m)

  const denom = 1 - vLine.m * hLine.m;
  if (Math.abs(denom) < 1e-10) return null;

  const x = (vLine.m * hLine.b + vLine.b) / denom;
  const y = hLine.m * x + hLine.b;

  return { x, y };
}

/**
 * Validate that the detected quad forms a reasonable document shape.
 */
function isValidQuad(quad: Quad, w: number, h: number): boolean {
  const { tl, tr, br, bl } = quad;

  // Must have reasonable area
  const area = polygonArea([tl, tr, br, bl]);
  const imageArea = w * h;
  if (area < imageArea * 0.05 || area > imageArea * 1.2) return false;

  // All points should be within image bounds (with small margin)
  const margin = -10;
  for (const p of [tl, tr, br, bl]) {
    if (p.x < margin || p.x > w + margin || p.y < margin || p.y > h + margin) {
      return false;
    }
  }

  // Check that corners form a convex quadrilateral in order
  if (!isConvex([tl, tr, br, bl])) return false;

  return true;
}

/**
 * Compute polygon area using the shoelace formula.
 */
function polygonArea(pts: Point[]): number {
  let area = 0;
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += pts[i].x * pts[j].y;
    area -= pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Check if a polygon is convex and vertices are in counter-clockwise order.
 */
function isConvex(pts: Point[]): boolean {
  const n = pts.length;
  let sign = 0;
  for (let i = 0; i < n; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    const c = pts[(i + 2) % n];
    const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (cross !== 0) {
      if (sign === 0) {
        sign = cross > 0 ? 1 : -1;
      } else if ((cross > 0 ? 1 : -1) !== sign) {
        return false; // not convex (sign change)
      }
    }
  }
  return true;
}

/**
 * Apply a 4-point perspective warp to deskew the document.
 * Maps the source quad to a flat rectangle.
 */
function perspectiveWarp(
  src: ImageData,
  srcW: number,
  srcH: number,
  quad: Quad,
  format: string,
  quality: number,
): string {
  // Compute output dimensions based on the quad's edge lengths
  const topLen = dist(quad.tl, quad.tr);
  const bottomLen = dist(quad.bl, quad.br);
  const leftLen = dist(quad.tl, quad.bl);
  const rightLen = dist(quad.tr, quad.br);

  const outW = Math.round(Math.max(topLen, bottomLen));
  const outH = Math.round(Math.max(leftLen, rightLen));

  // Clamp to reasonable max size for mobile performance
  const maxOutDim = 2000;
  const outScale = Math.min(1, maxOutDim / Math.max(outW, outH));
  const dstW = Math.max(1, Math.round(outW * outScale));
  const dstH = Math.max(1, Math.round(outH * outScale));

  // Source quad corners (in order: tl, tr, br, bl)
  const srcPts = [quad.tl, quad.tr, quad.br, quad.bl];

  // Destination rectangle corners
  const dstPts: Point[] = [
    { x: 0, y: 0 },
    { x: dstW - 1, y: 0 },
    { x: dstW - 1, y: dstH - 1 },
    { x: 0, y: dstH - 1 },
  ];

  // Compute homography from destination to source
  const H = computeHomography(dstPts, srcPts);
  if (!H) {
    // Fallback: just return the original image cropped to quad bounds
    return fallbackCrop(src, srcW, srcH, quad, format, quality);
  }

  // Create output canvas (use regular canvas for broad mobile compatibility)
  const outCanvas = document.createElement("canvas");
  outCanvas.width = dstW;
  outCanvas.height = dstH;
  const ctx = outCanvas.getContext("2d");
  if (!ctx) return fallbackCrop(src, srcW, srcH, quad, format, quality);

  const dstImageData = ctx.createImageData(dstW, dstH);
  const srcData = src.data;
  const dstData = dstImageData.data;

  // For each output pixel, find the source pixel using the homography
  for (let dy = 0; dy < dstH; dy++) {
    for (let dx = 0; dx < dstW; dx++) {
      // Apply homography: src = H * dst
      const w = H[6] * dx + H[7] * dy + H[8];
      const sx = (H[0] * dx + H[1] * dy + H[2]) / w;
      const sy = (H[3] * dx + H[4] * dy + H[5]) / w;

      const di = (dy * dstW + dx) * 4;

      if (sx >= 0 && sx < srcW - 1 && sy >= 0 && sy < srcH - 1) {
        // Bilinear interpolation
        const sx0 = Math.floor(sx);
        const sy0 = Math.floor(sy);
        const sx1 = sx0 + 1;
        const sy1 = sy0 + 1;
        const fx = sx - sx0;
        const fy = sy - sy0;

        for (let c = 0; c < 4; c++) {
          const i00 = (sy0 * srcW + sx0) * 4 + c;
          const i10 = (sy0 * srcW + sx1) * 4 + c;
          const i01 = (sy1 * srcW + sx0) * 4 + c;
          const i11 = (sy1 * srcW + sx1) * 4 + c;

          const top = srcData[i00] * (1 - fx) + srcData[i10] * fx;
          const bot = srcData[i01] * (1 - fx) + srcData[i11] * fx;
          dstData[di + c] = Math.round(top * (1 - fy) + bot * fy);
        }
      }
      // else: leave as transparent (already 0 from createImageData)
    }
  }

  ctx.putImageData(dstImageData, 0, 0);

  return outCanvas.toDataURL(format, quality);
}

/**
 * Fallback: crop to the quad bounding box.
 */
function fallbackCrop(
  src: ImageData,
  srcW: number,
  srcH: number,
  quad: Quad,
  format: string,
  quality: number,
): string {
  const pts = [quad.tl, quad.tr, quad.br, quad.bl];
  const minX = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.x))));
  const minY = Math.max(0, Math.floor(Math.min(...pts.map((p) => p.y))));
  const maxX = Math.min(srcW - 1, Math.ceil(Math.max(...pts.map((p) => p.x))));
  const maxY = Math.min(srcH - 1, Math.ceil(Math.max(...pts.map((p) => p.y))));
  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  const outCanvas = document.createElement("canvas");
  outCanvas.width = cropW;
  outCanvas.height = cropH;
  const ctx = outCanvas.getContext("2d")!;
  const cropData = ctx.createImageData(cropW, cropH);
  const srcData = src.data;
  const dst = cropData.data;

  for (let y = 0; y < cropH; y++) {
    for (let x = 0; x < cropW; x++) {
      const si = ((minY + y) * srcW + (minX + x)) * 4;
      const di = (y * cropW + x) * 4;
      dst[di] = srcData[si];
      dst[di + 1] = srcData[si + 1];
      dst[di + 2] = srcData[si + 2];
      dst[di + 3] = srcData[si + 3];
    }
  }
  ctx.putImageData(cropData, 0, 0);
  return outCanvas.toDataURL(format, quality);
}

/**
 * Compute the 3x3 homography matrix mapping dst points to src points.
 */
function computeHomography(
  dstPts: Point[],
  srcPts: Point[],
): number[] | null {
  // Build the linear system A * h = b
  // For each correspondence (x,y) → (u,v):
  // [x, y, 1, 0, 0, 0, -u*x, -u*y] * h = u
  // [0, 0, 0, x, y, 1, -v*x, -v*y] * h = v
  const n = dstPts.length;
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < n; i++) {
    const x = dstPts[i].x;
    const y = dstPts[i].y;
    const u = srcPts[i].x;
    const v = srcPts[i].y;

    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  // Solve using Gaussian elimination with partial pivoting
  const size = 8;
  const aug: number[][] = [];
  for (let i = 0; i < size; i++) {
    aug.push([...A[i].slice(0, size), b[i]]);
  }

  for (let col = 0; col < size; col++) {
    // Find pivot
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < size; row++) {
      const val = Math.abs(aug[row][col]);
      if (val > maxVal) {
        maxVal = val;
        maxRow = row;
      }
    }

    if (maxVal < 1e-12) return null; // singular

    // Swap rows
    if (maxRow !== col) {
      [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];
    }

    // Eliminate below
    for (let row = col + 1; row < size; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= size; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  // Back substitution
  const h = new Array(size).fill(0);
  for (let i = size - 1; i >= 0; i--) {
    let sum = aug[i][size];
    for (let j = i + 1; j < size; j++) {
      sum -= aug[i][j] * h[j];
    }
    h[i] = sum / aug[i][i];
  }

  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

/**
 * Euclidean distance between two points.
 */
function dist(a: Point, b: Point): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}
