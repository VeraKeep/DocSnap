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

// ── Shared types, seed catalog, and localStorage helpers ────────────────
// These live in `src/assetStore.ts` — a client-safe module with no Node
// imports — so browser bundles can import `Asset` / `SEED_ASSETS` /
// `loadAssets` / `saveAssets` / `nextAssetId` without evaluating this
// server-only module. This module imports what the server store needs
// (types, defaults, normalization) and keeps its own Node-only logic below.
import {
  DEFAULTS,
  normalizeAsset,
  optStr,
  type Asset,
  type DocumentRef,
} from "./assetStore";

// ── Server-side per-user JSON store ────────────────────────────────────

/**
 * Server-only: resolve the per-user data directory. Deliberately lazy — this
 * module is imported by client bundles for its server functions, so any
 * module-scope Node evaluation (`path.join(process.cwd(), ...)`) would run in
 * the browser and throw "process is not defined" on cold page loads.
 */
function getDataDir(): string {
  return path.join(process.cwd(), "data");
}

function ensureDataDir() {
  if (!fs.existsSync(getDataDir())) {
    fs.mkdirSync(getDataDir(), { recursive: true });
  }
}

function getUserAssetsPath(userId: string): string {
  return path.join(getDataDir(), `${userId}-assets.json`);
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
