/**
 * GarageSnap — asset persistence for the DocSnap module.
 *
 * Persistence follows DocSnap's `src/cloudStorage.ts` conventions exactly:
 * per-user JSON files at `data/<clerkUserId>-assets.json` (the `-assets`
 * suffix keeps asset files distinct from DocSnap's document files at
 * `data/<clerkUserId>.json`), with the acting identity ALWAYS resolved from
 * the verified Clerk session on the server. Client-supplied ids are never
 * trusted: every server function uses `requireServerFunctionUser()` (the
 * JWKS-verified session adapter in `src/lib/server-auth.ts`, the same seam
 * ReceiptSnap uses) and validates/sanitizes all input.
 *
 * The `Asset` type, seed catalog, and localStorage helpers are the
 * unauthenticated / offline fallback — a faithful port of the GarageSnap
 * prototype's `assetStore.ts`. When the user is signed in and the cloud
 * store is configured, the server list wins and localStorage is only an
 * offline mirror. Asset records store DocSnap `CloudDocument` references
 * (id/name/fileUrl) — never document content — so DocSnap stays the source
 * of truth for manuals, receipts, and warranties.
 */
import { createServerFn } from "@tanstack/react-start";
import { UTApi } from "uploadthing/server";
import fs from "node:fs";
import path from "node:path";
import { requireServerFunctionUser } from "~/lib/server-auth";

// ── Shared types ───────────────────────────────────────────────────────

/**
 * Reference to a DocSnap CloudDocument (manual / receipt / warranty).
 * GarageSnap stores only the reference — document content stays in DocSnap.
 */
export type DocumentRef = {
  /** DocSnap CloudDocument id. */
  docId?: string;
  /** Display label (e.g. "Milwaukee M18 manual.pdf"). */
  name: string;
  /** DocSnap file URL (present when the document came from the DocSnap library). */
  fileUrl?: string;
};

export type Asset = {
  id: number;
  name: string;
  brand: string;
  category: string;
  location: string;
  serial: string;
  image: string;
  status: string;
  warranty: string;
  nextService: string;
  document: string;
  /** UploadThing file key when `image` was uploaded via GarageSnap (enables cleanup on delete). */
  imageKey?: string;
  /** Reference seam for the attached DocSnap document. */
  documentRef?: DocumentRef | null;
  /** ISO timestamp set server-side when the asset is first saved. */
  createdAt?: string;
};

/** Demo catalog used for the unauthenticated preview (clearly demo data). */
export const SEED_ASSETS: Asset[] = [
  { id: 1, name: "M18 Fuel Impact Driver", brand: "Milwaukee", category: "Power tools", location: "Wall 01 · Bay A", serial: "M18-48291", image: "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=900&q=80", status: "In service", warranty: "May 18, 2027", nextService: "Clean & inspect · Aug 14, 2026", document: "Milwaukee M18 manual.pdf" },
  { id: 2, name: "KRL1023 Tool Chest", brand: "Snap-on", category: "Storage", location: "Main bench", serial: "SN-90481", image: "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?auto=format&fit=crop&w=900&q=80", status: "In service", warranty: "No expiry", nextService: "Drawer slide check · Sep 02, 2026", document: "Snap-on warranty.pdf" },
  { id: 3, name: "10-inch Table Saw", brand: "DeWalt", category: "Shop equipment", location: "Back wall · Bay C", serial: "DW-77104", image: "https://images.unsplash.com/photo-1504148455328-c376907d081c?auto=format&fit=crop&w=900&q=80", status: "Needs attention", warranty: "Nov 03, 2026", nextService: "Blade alignment · Overdue", document: "DeWalt DWE7491 guide.pdf" },
  { id: 4, name: "M12 Rotary Tool", brand: "Milwaukee", category: "Power tools", location: "Mobile cart 02", serial: "M12-11820", image: "https://images.unsplash.com/photo-1581147036324-c17ac41e9e50?auto=format&fit=crop&w=900&q=80", status: "In service", warranty: "Jan 26, 2028", nextService: "Battery rotation · Oct 20, 2026", document: "M12 user guide.pdf" },
];

const DEFAULTS = {
  brand: "", category: "", serial: "Not recorded",
  image: "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?auto=format&fit=crop&w=900&q=80",
  status: "In service", warranty: "Not recorded",
  nextService: "Add a maintenance date", document: "No document attached",
};

const STORAGE_KEY = "docsnap.garagesnap.assets";
/** Bump when the stored shape changes; migrate old versions in `migrate`. */
const SCHEMA_VERSION = 1;

type StoredEnvelope = { version: number; assets: Asset[] };

// ── Client-side (localStorage) seam — unauthenticated/offline fallback ──

function str(v: unknown, fallback: string) {
  return typeof v === "string" ? v : fallback;
}
function optStr(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Coerce an unknown stored entry into a usable Asset, filling in defaults. */
export function normalizeAsset(raw: unknown): Asset | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.id !== "number" || !Number.isFinite(a.id)) return null;
  if (typeof a.name !== "string" || a.name.trim() === "") return null;
  if (typeof a.location !== "string" || a.location.trim() === "") return null;
  let documentRef: DocumentRef | null = null;
  if (typeof a.documentRef === "object" && a.documentRef !== null && !Array.isArray(a.documentRef)) {
    const d = a.documentRef as Record<string, unknown>;
    const name = typeof d.name === "string" ? d.name : "";
    if (name !== "") {
      documentRef = { docId: optStr(d.docId), name, fileUrl: optStr(d.fileUrl) };
    }
  }
  return {
    id: a.id,
    name: a.name,
    brand: str(a.brand, DEFAULTS.brand),
    category: str(a.category, DEFAULTS.category),
    location: a.location,
    serial: str(a.serial, DEFAULTS.serial),
    image: str(a.image, DEFAULTS.image),
    status: str(a.status, DEFAULTS.status),
    warranty: str(a.warranty, DEFAULTS.warranty),
    nextService: str(a.nextService, DEFAULTS.nextService),
    document: str(a.document, DEFAULTS.document),
    imageKey: optStr(a.imageKey),
    documentRef,
    createdAt: optStr(a.createdAt),
  };
}

function seedCopy(): Asset[] {
  return SEED_ASSETS.map((a) => ({ ...a }));
}

function validList(list: unknown): Asset[] | null {
  if (!Array.isArray(list)) return null;
  const assets = list.map(normalizeAsset).filter((a): a is Asset => a !== null);
  return assets.length > 0 ? assets : null;
}

function extractAssets(parsed: unknown): Asset[] | null {
  if (Array.isArray(parsed)) return validList(parsed); // legacy bare array
  if (typeof parsed === "object" && parsed !== null) {
    const env = parsed as Record<string, unknown>;
    if (typeof env.version === "number" && Array.isArray(env.assets)) {
      // Migration hook: switch on env.version here when the schema changes.
      return validList(env.assets);
    }
  }
  return null;
}

/** Load persisted assets; seeds (and persists) on first run or bad payload. */
export function loadAssets(): Asset[] {
  if (typeof window === "undefined") return seedCopy(); // SSR guard
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      const assets = extractAssets(parsed);
      if (assets) return assets;
    }
  } catch {
    // storage unavailable or corrupt JSON — degrade to in-memory seed
  }
  const seeded = seedCopy();
  saveAssets(seeded); // best-effort seed on first run
  return seeded;
}

/** Persist assets. Returns false when storage is unavailable (silent degrade). */
export function saveAssets(assets: Asset[]): boolean {
  if (typeof window === "undefined") return false;
  try {
    const envelope: StoredEnvelope = { version: SCHEMA_VERSION, assets };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
    return true;
  } catch {
    return false;
  }
}

/** Collision-free integer id for the local (non-cloud) path. */
export function nextAssetId(assets: Asset[]): number {
  const max = assets.reduce((m, a) => Math.max(m, a.id), 0);
  return Math.max(max + 1, Date.now());
}

// ── Server-side per-user JSON store ────────────────────────────────────

const DATA_DIR = path.join(process.cwd(), "data");

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function getUserAssetsPath(userId: string): string {
  return path.join(DATA_DIR, `${userId}-assets.json`);
}

function readUserAssetsFile(userId: string): Asset[] {
  ensureDataDir();
  const filePath = getUserAssetsPath(userId);
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Asset[];
    return Array.isArray(parsed) ? parsed.map(normalizeAsset).filter((a): a is Asset => a !== null) : [];
  } catch {
    return [];
  }
}

function writeUserAssetsFile(userId: string, assets: Asset[]) {
  ensureDataDir();
  fs.writeFileSync(getUserAssetsPath(userId), JSON.stringify(assets, null, 2), "utf-8");
}

/** Server-only helper: read a user's assets directly from the data dir.
 *  Safe to import from API route handlers (plain function, no serverFn). */
export function readUserAssets(userId: string): Asset[] {
  return readUserAssetsFile(userId);
}

function nextServerAssetId(assets: Asset[]): number {
  const max = assets.reduce((m, a) => Math.max(m, a.id), 0);
  return max + 1;
}

/** Sanitize an incoming asset payload into a safe stored shape. */
function sanitizeAssetInput(raw: unknown): Omit<Asset, "id" | "createdAt"> {
  const a = (raw ?? {}) as Record<string, unknown>;
  if (typeof a.name !== "string" || a.name.trim() === "") throw new Error("Asset name is required");
  if (typeof a.location !== "string" || a.location.trim() === "") throw new Error("Asset location is required");
  const s = (v: unknown, fallback: string) => (typeof v === "string" && v.trim() !== "" ? v.trim() : fallback);
  let documentRef: DocumentRef | null = null;
  if (typeof a.documentRef === "object" && a.documentRef !== null && !Array.isArray(a.documentRef)) {
    const d = a.documentRef as Record<string, unknown>;
    const name = typeof d.name === "string" ? d.name.trim() : "";
    if (name !== "") {
      documentRef = { docId: optStr(d.docId), name, fileUrl: optStr(d.fileUrl) };
    }
  }
  return {
    name: a.name.trim(),
    brand: s(a.brand, DEFAULTS.brand),
    category: s(a.category, DEFAULTS.category),
    location: a.location.trim(),
    serial: s(a.serial, DEFAULTS.serial),
    image: s(a.image, DEFAULTS.image),
    status: s(a.status, DEFAULTS.status),
    warranty: s(a.warranty, DEFAULTS.warranty),
    nextService: s(a.nextService, DEFAULTS.nextService),
    document: s(a.document, DEFAULTS.document),
    imageKey: optStr(a.imageKey),
    documentRef,
  };
}

/** Check whether the asset cloud store is configured (auth + uploads env). */
export const isAssetCloudConfigured = createServerFn({ method: "GET" }).handler(async () => {
  return !!(
    process.env.UPLOADTHING_SECRET &&
    process.env.CLERK_SECRET_KEY &&
    process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
  );
});

/** List all saved assets for the verified user. No client-supplied id. */
export const listAssets = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireServerFunctionUser();
  return readUserAssetsFile(userId);
});

/** Add an asset. The id and createdAt are assigned server-side. */
export const addAsset = createServerFn({ method: "POST" })
  .validator((raw: unknown) => {
    const d = (raw ?? {}) as { asset?: unknown };
    return sanitizeAssetInput(d.asset);
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    const assets = readUserAssetsFile(userId);
    const asset: Asset = {
      ...data,
      id: nextServerAssetId(assets),
      createdAt: new Date().toISOString(),
    };
    assets.unshift(asset);
    writeUserAssetsFile(userId, assets);
    return asset;
  });

/** Update an asset in place (matched by id). The id is never trusted from
 *  the payload beyond selecting the record the verified user owns. */
export const updateAsset = createServerFn({ method: "POST" })
  .validator((raw: unknown) => {
    const d = (raw ?? {}) as { id?: unknown; asset?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid asset id");
    return { id, asset: sanitizeAssetInput(d.asset) };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    const assets = readUserAssetsFile(userId);
    const idx = assets.findIndex((a) => a.id === data.id);
    if (idx === -1) throw new Error("Asset not found");
    const updated: Asset = { ...assets[idx], ...data.asset, id: data.id };
    assets[idx] = updated;
    writeUserAssetsFile(userId, assets);
    return updated;
  });

/** Delete an asset (metadata, plus its own UploadThing image when one is
 *  stored). Never touches a referenced DocSnap document — the document stays
 *  in DocSnap's document library regardless. */
export const deleteAsset = createServerFn({ method: "POST" })
  .validator((raw: unknown) => {
    const d = (raw ?? {}) as { id?: unknown };
    const id = typeof d.id === "number" ? d.id : Number(d.id);
    if (!Number.isFinite(id) || id <= 0) throw new Error("Invalid asset id");
    return id;
  })
  .handler(async ({ data: id }) => {
    const userId = await requireServerFunctionUser();
    const assets = readUserAssetsFile(userId);
    const asset = assets.find((a) => a.id === id);
    if (!asset) throw new Error("Asset not found");

    // Delete the UploadThing photo when this asset owns one (mirrors
    // DocSnap's deleteDocument file cleanup). Non-fatal: metadata is
    // removed either way.
    if (asset.imageKey && process.env.UPLOADTHING_SECRET) {
      try {
        const utapi = new UTApi({ token: process.env.UPLOADTHING_SECRET });
        await utapi.deleteFiles(asset.imageKey);
      } catch (err) {
        console.error("Failed to delete UploadThing file:", err);
      }
    }

    writeUserAssetsFile(userId, assets.filter((a) => a.id !== id));
    return { success: true };
  });
