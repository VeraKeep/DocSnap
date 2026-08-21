/**
 * Client-safe GarageSnap asset types, seed catalog, and localStorage helpers.
 *
 * This module is safe to import from browser code: it contains NO Node-only
 * imports and NO module-scope code that touches `process`, `fs`, `path`, or
 * UploadThing. It is a faithful port of the GarageSnap prototype's
 * `assetStore.ts` (the unauthenticated / offline fallback) so client
 * components can import `Asset` / `DocumentRef` / `SEED_ASSETS` /
 * `loadAssets` / `saveAssets` / `nextAssetId` without pulling
 * `src/assetStorage.ts` into the browser bundle — that module is server-heavy
 * and must stay server-only.
 */

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

export const DEFAULTS = {
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

export function optStr(v: unknown): string | undefined {
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
  const str = (v: unknown, fallback: string) => (typeof v === "string" ? v : fallback);
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
