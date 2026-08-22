/**
 * GarageSnap module — owner-scoped server functions.
 *
 * Every garage item is personal data scoped to exactly one Clerk user. The
 * owner identity is resolved ONLY from the server session via the auth adapter
 * (src/lib/server-auth.ts); any caller-supplied owner ID is ignored. All
 * queries filter by the server-resolved owner, so no cross-user reads or leaks
 * are possible. Items are never queried straight by bare id — every
 * read/update/delete is mediated through an ownership check on
 * `clerk_user_id`, so an attacker cannot reach another user's records even
 * guessing item ids.
 *
 * Uses DocSnap's shared Neon connection helper (`~/db`) and the host schema
 * (src/db-schema.sql), and degrades gracefully to a no-op when DATABASE_URL is
 * unset (the UI reports storage as not configured rather than crashing).
 *
 * GATING — GarageSnap is a paid add-on (business-plan rev 16): $2.99/month or
 * $29.99/year, gated by an `addon_garagesnap` flag on the user (mirroring
 * HomeSnap's `addon_homesnap`). Every read/write handler FAILS CLOSED (HTTP
 * 403) for a signed-in user who does not own the add-on. Pricing/checkout live
 * in src/modules.ts + src/moduleCheckout.ts (already wired and unchanged); the
 * webhook grants/revokes the flag (see src/routes/api/-stripe-webhook.ts).
 *
 * The `garage_items.home_object_id` column is a RESERVED, nullable link to a
 * HomeSnap PropertyObject — always null for now, set by the upcoming
 * GarageSnap ↔ HomeSnap object-sharing feature (the next task).
 */
import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/db";
import { requireServerFunctionUser } from "~/lib/server-auth";
import { hasGarageSnapAddon } from "~/subscription";
import { asGarageCategory, type GarageCategory, type GarageItem } from "./types";

/* ------------------------------------------------------------------ */
/* Row coercion helper (sql returns Record<string, unknown>[])         */
/* ------------------------------------------------------------------ */

function toGarageItem(r: Record<string, unknown>): GarageItem {
  return {
    id: Number(r.id),
    name: (r.name as string) ?? "",
    category: asGarageCategory(r.category),
    make: (r.make as string | null) ?? null,
    model: (r.model as string | null) ?? null,
    serial_number: (r.serial_number as string | null) ?? null,
    photo_url: (r.photo_url as string | null) ?? null,
    purchase_date: (r.purchase_date as string | null) ?? null,
    purchase_price: r.purchase_price == null ? null : Number(r.purchase_price),
    warranty_expiration: (r.warranty_expiration as string | null) ?? null,
    storage_location: (r.storage_location as string | null) ?? null,
    home_object_id: r.home_object_id == null ? null : Number(r.home_object_id),
    created_at: String(r.created_at),
  };
}

/** Trim to a nullable string, collapsing empty/whitespace to null. */
function text(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t : null;
}

/** Trim to a non-null string (for required fields). */
function requiredText(v: unknown, label: string): string {
  const t = text(v);
  if (!t) throw new Error(`${label} is required.`);
  return t;
}

/** Parse a user-entered price to a finite number, or null. */
function price(v: unknown): number | null {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function positiveId(v: unknown, label: string): number {
  const id = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(id) || id <= 0) throw new Error(`${label} is invalid.`);
  return id;
}

/* ------------------------------------------------------------------ */
/* Add-on entitlement gate (fails closed)                               */
/* ------------------------------------------------------------------ */

/** Clear, honest message for users without the add-on. */
export const ADDON_LOCKED_MESSAGE =
  "GarageSnap is a paid add-on — purchase it to unlock.";
/** Machine-readable code the UI can use to render the locked/upgrade screen. */
export const ADDON_LOCKED_CODE = "garagesnap_addon_required";

/**
 * HARD entitlement gate. GarageSnap is a paid add-on, NOT bundled into any
 * DocSnap tier. Fails CLOSED with HTTP 403 for any signed-in user who does not
 * own the add-on — including every paid (Personal/Household/Complete)
 * subscriber. Anonymous callers are already rejected with 401 by
 * requireServerFunctionUser.
 */
async function requireGarageSnapAddon(userId: string): Promise<void> {
  const owned = await hasGarageSnapAddon(userId);
  if (!owned) {
    throw new Response(
      JSON.stringify({ error: ADDON_LOCKED_MESSAGE, code: ADDON_LOCKED_CODE }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * GarageSnap entitlement for the signed-in user. This is the UI's gate channel
 * (does not throw for a locked user — it reports the state). `hasAddon` is
 * true only when the user owns the add-on. Anonymous → 401 (fail closed).
 */
export const getGarageSnapEntitlement = createServerFn({ method: "GET" }).handler(async (): Promise<{ configured: boolean; hasAddon: boolean }> => {
  const userId = await requireServerFunctionUser();
  if (!process.env.DATABASE_URL) return { configured: false, hasAddon: false };
  const hasAddon = await hasGarageSnapAddon(userId);
  return { configured: true, hasAddon };
});

/* ------------------------------------------------------------------ */
/* Ownership helpers                                                   */
/* ------------------------------------------------------------------ */

/** Returns the garage item row if it belongs to the caller, else null. */
async function ownedGarageItem(userId: string, itemId: number) {
  const rows = (await sql`
    SELECT * FROM garage_items
    WHERE id = ${itemId} AND clerk_user_id = ${userId}
  `) as Record<string, unknown>[];
  return rows[0] ?? null;
}

async function requireOwnedGarageItem(
  userId: string,
  itemId: number,
): Promise<Record<string, unknown>> {
  const item = await ownedGarageItem(userId, itemId);
  if (!item) {
    throw new Response(
      JSON.stringify({ error: "Garage item not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  return item;
}

/* ------------------------------------------------------------------ */
/* Garage items                                                        */
/* ------------------------------------------------------------------ */

/** All of the caller's garage items, newest first. */
export const listGarageItems = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireServerFunctionUser();
  await requireGarageSnapAddon(userId);
  if (!process.env.DATABASE_URL) return { configured: false, items: [] };
  const rows = (await sql`
    SELECT * FROM garage_items
    WHERE clerk_user_id = ${userId}
    ORDER BY created_at DESC
  `) as Record<string, unknown>[];
  return { configured: true, items: rows.map(toGarageItem) };
});

/** Read a single garage item — only if it belongs to the caller. */
export const getGarageItem = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    return { id: positiveId(d.id, "Item id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireGarageSnapAddon(userId);
    const item = await requireOwnedGarageItem(userId, data.id);
    if (!process.env.DATABASE_URL) {
      return { configured: false, item: toGarageItem(item) };
    }
    return { configured: true, item: toGarageItem(item) };
  });

/** Create a garage item for the caller. */
export const createGarageItem = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      name?: unknown;
      category?: unknown;
      make?: unknown;
      model?: unknown;
      serial_number?: unknown;
      photo_url?: unknown;
      purchase_date?: unknown;
      purchase_price?: unknown;
      warranty_expiration?: unknown;
      storage_location?: unknown;
    };
    return {
      name: requiredText(d.name, "Item name").slice(0, 300),
      category: (text(d.category) ?? "other") as GarageCategory,
      make: text(d.make)?.slice(0, 200) ?? null,
      model: text(d.model)?.slice(0, 200) ?? null,
      serial_number: text(d.serial_number)?.slice(0, 200) ?? null,
      photo_url: text(d.photo_url)?.slice(0, 1000) ?? null,
      purchase_date: text(d.purchase_date)?.slice(0, 40) ?? null,
      purchase_price: price(d.purchase_price),
      warranty_expiration: text(d.warranty_expiration)?.slice(0, 40) ?? null,
      storage_location: text(d.storage_location)?.slice(0, 200) ?? null,
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireGarageSnapAddon(userId);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      INSERT INTO garage_items (
        clerk_user_id, name, category, make, model, serial_number, photo_url,
        purchase_date, purchase_price, warranty_expiration, storage_location
      ) VALUES (
        ${userId}, ${data.name}, ${data.category}, ${data.make}, ${data.model},
        ${data.serial_number}, ${data.photo_url}, ${data.purchase_date},
        ${data.purchase_price}, ${data.warranty_expiration}, ${data.storage_location}
      )
      RETURNING *
    `) as Record<string, unknown>[];
    return { item: toGarageItem(rows[0]) };
  });

/** Update a garage item — only if it belongs to the caller. */
export const updateGarageItem = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      id?: unknown;
      name?: unknown;
      category?: unknown;
      make?: unknown;
      model?: unknown;
      serial_number?: unknown;
      photo_url?: unknown;
      purchase_date?: unknown;
      purchase_price?: unknown;
      warranty_expiration?: unknown;
      storage_location?: unknown;
    };
    return {
      id: positiveId(d.id, "Item id"),
      name: requiredText(d.name, "Item name").slice(0, 300),
      category: (text(d.category) ?? "other") as GarageCategory,
      make: text(d.make)?.slice(0, 200) ?? null,
      model: text(d.model)?.slice(0, 200) ?? null,
      serial_number: text(d.serial_number)?.slice(0, 200) ?? null,
      photo_url: text(d.photo_url)?.slice(0, 1000) ?? null,
      purchase_date: text(d.purchase_date)?.slice(0, 40) ?? null,
      purchase_price: price(d.purchase_price),
      warranty_expiration: text(d.warranty_expiration)?.slice(0, 40) ?? null,
      storage_location: text(d.storage_location)?.slice(0, 200) ?? null,
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireGarageSnapAddon(userId);
    await requireOwnedGarageItem(userId, data.id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      UPDATE garage_items SET
        name = ${data.name},
        category = ${data.category},
        make = ${data.make},
        model = ${data.model},
        serial_number = ${data.serial_number},
        photo_url = ${data.photo_url},
        purchase_date = ${data.purchase_date},
        purchase_price = ${data.purchase_price},
        warranty_expiration = ${data.warranty_expiration},
        storage_location = ${data.storage_location}
      WHERE id = ${data.id}
      RETURNING *
    `) as Record<string, unknown>[];
    if (!rows[0]) throw new Error("Garage item not found.");
    return { item: toGarageItem(rows[0]) };
  });

/** Delete a garage item — only if it belongs to the caller. */
export const deleteGarageItem = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    return { id: positiveId(d.id, "Item id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireGarageSnapAddon(userId);
    await requireOwnedGarageItem(userId, data.id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    await sql`DELETE FROM garage_items WHERE id = ${data.id}`;
    return { deleted: true };
  });
