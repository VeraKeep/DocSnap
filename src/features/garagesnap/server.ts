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
 * The `garage_items.home_object_id` column is a nullable link to a HomeSnap
 * PropertyObject — the GarageSnap ↔ HomeSnap object-sharing feature (below).
 * When set, the same physical item is tracked in both apps: GarageSnap records
 * its storage location while HomeSnap records its room/property and holds the
 * receipt/warranty documents. Linking/unlinking is owner-safe (both the garage
 * item AND the home object must belong to the caller), and the cross-module
 * actions fail CLOSED on both add-on gates (garagesnap for touching the garage
 * item, homesnap for reaching into home data).
 */
import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/db";
import { requireServerFunctionUser } from "~/lib/server-auth";
import { hasGarageSnapAddon, hasHomeSnapAddon } from "~/subscription";
import {
  asGarageCategory,
  type GarageCategory,
  type GarageLinkedHomeObject,
  type GarageItem,
} from "./types";

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

/** HomeSnap gate (cross-module): fail CLOSED if the user lacks addon_homesnap. */
async function requireHomeSnapAddon(userId: string): Promise<void> {
  const owned = await hasHomeSnapAddon(userId);
  if (!owned) {
    throw new Response(
      JSON.stringify({ error: "HomeSnap is a paid add-on — purchase it to unlock." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * Returns the HomeSnap property row if it belongs to the caller, else null.
 * Used to validate the home side of a cross-module link — the sharing feature
 * must never let a caller reference a property/object they don't own.
 */
async function ownedHomeProperty(userId: string, propertyId: number) {
  const rows = (await sql`
    SELECT * FROM properties
    WHERE id = ${propertyId} AND clerk_user_id = ${userId}
  `) as Record<string, unknown>[];
  return rows[0] ?? null;
}

/**
 * Returns the HomeSnap object row if it sits beneath an owned property, else
 * null. The join to properties (filtered by clerk_user_id) is the scoping
 * boundary — a caller can never link to another user's object.
 */
async function ownedHomeObject(userId: string, objectId: number) {
  const rows = (await sql`
    SELECT po.* FROM property_objects po
    JOIN properties p ON p.id = po.property_id
    WHERE po.id = ${objectId} AND p.clerk_user_id = ${userId}
  `) as Record<string, unknown>[];
  return rows[0] ?? null;
}

async function requireOwnedHomeObject(
  userId: string,
  objectId: number,
): Promise<Record<string, unknown>> {
  const obj = await ownedHomeObject(userId, objectId);
  if (!obj) {
    throw new Response(
      JSON.stringify({ error: "Home object not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  return obj;
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

/* ------------------------------------------------------------------ */
/* GarageSnap ↔ HomeSnap object sharing                                */
/* ------------------------------------------------------------------ */
/**
 * The shared-context feature: one physical item tracked in both apps. A garage
 * item's `home_object_id` FK points at a HomeSnap PropertyObject. When set:
 *   - GarageSnap shows which HomeSnap property/room the item lives in.
 *   - HomeSnap shows (read-only) that the object is also tracked in GarageSnap
 *     and where it's stored.
 * Both sides of a link must belong to the caller — every action validates the
 * garage item AND the home property/object before touching anything. Both
 * add-on gates apply (fail closed): garagesnap for writing the garage item,
 * homesnap for reaching into home data.
 */

/** Public share shape for a garage item's linked home object + its property. */
function toLinkedHomeObject(r: Record<string, unknown>): GarageLinkedHomeObject {
  return {
    object_id: Number(r.object_id),
    object_name: (r.object_name as string) ?? "",
    object_type: (r.object_type as string | null) ?? null,
    room_location: (r.room_location as string | null) ?? null,
    property_id: Number(r.property_id),
    property_nickname: (r.property_nickname as string) ?? "",
  };
}

/**
 * Fetch the HomeSnap object a garage item is linked to (if any), with its
 * property nickname and room, so GarageSnap can surface where the item lives in
 * HomeSnap. Owner-safe: the garage item must belong to the caller, and the
 * joined home rows are scope-guarded by the same clerk_user_id.
 */
export const getGarageItemHomeLink = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { item_id?: unknown };
    return { item_id: positiveId(d.item_id, "Item id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireGarageSnapAddon(userId);
    await requireOwnedGarageItem(userId, data.item_id);
    if (!process.env.DATABASE_URL) return { linked: false, link: null };
    const rows = (await sql`
      SELECT po.id AS object_id, po.name AS object_name, po.object_type,
             po.room_location, p.id AS property_id, p.nickname AS property_nickname
      FROM garage_items gi
      JOIN property_objects po ON po.id = gi.home_object_id
      JOIN properties p ON p.id = po.property_id
      WHERE gi.id = ${data.item_id} AND gi.clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    if (!rows[0]) return { linked: false, link: null };
    return { linked: true, link: toLinkedHomeObject(rows[0]) };
  });

/**
 * Link a garage item to a HomeSnap object. Owner-safe: the caller must own both
 * the garage item and the home object (and the object's property). A previous
 * link (if any) is replaced — a garage item maps to a single home object.
 * Fails CLOSED on both add-on gates.
 */
export const linkGarageItemToHomeObject = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { item_id?: unknown; object_id?: unknown };
    return {
      item_id: positiveId(d.item_id, "Item id"),
      object_id: positiveId(d.object_id, "Home object id"),
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireGarageSnapAddon(userId);
    await requireHomeSnapAddon(userId);
    await requireOwnedGarageItem(userId, data.item_id);
    await requireOwnedHomeObject(userId, data.object_id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      UPDATE garage_items SET home_object_id = ${data.object_id}
      WHERE id = ${data.item_id}
      RETURNING *
    `) as Record<string, unknown>[];
    return { item: toGarageItem(rows[0]) };
  });

/**
 * Remove the GarageSnap ↔ HomeSnap link from a garage item (home_object_id →
 * NULL). Owner-safe: the garage item must belong to the caller. Fails CLOSED on
 * both add-on gates (the item currently references home data).
 */
export const unlinkGarageItemFromHomeObject = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { item_id?: unknown };
    return { item_id: positiveId(d.item_id, "Item id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireGarageSnapAddon(userId);
    await requireHomeSnapAddon(userId);
    await requireOwnedGarageItem(userId, data.item_id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      UPDATE garage_items SET home_object_id = NULL
      WHERE id = ${data.item_id}
      RETURNING *
    `) as Record<string, unknown>[];
    return { item: toGarageItem(rows[0]) };
  });

/**
 * Create a HomeSnap object from a garage item and link them in one step — the
 * "create a home object from this item and link it" path. The object is
 * pre-filled from the garage item (name, make→manufacturer, model, serial,
 * storage_location→room_location, purchase date/price, warranty expiration),
 * reusing the same resolve-or-create-property rule as createObjectFromReceipt.
 * Owner-safe (verified garage item + owned/auto property). Fails CLOSED on both
 * add-on gates since it creates HomeSnap data and links a garage item.
 */
export const createLinkedHomeObjectFromGarage = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { item_id?: unknown; property_id?: unknown };
    return {
      item_id: positiveId(d.item_id, "Item id"),
      property_id:
        d.property_id == null || d.property_id === ""
          ? null
          : positiveId(d.property_id, "Property id"),
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireGarageSnapAddon(userId);
    await requireHomeSnapAddon(userId);
    const item = await requireOwnedGarageItem(userId, data.item_id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }

    // Resolve (or create) the property the new home object will live under.
    let propertyId = data.property_id;
    if (propertyId != null) {
      if (!(await ownedHomeProperty(userId, propertyId))) {
        throw new Response(
          JSON.stringify({ error: "Property not found." }),
          { status: 404, headers: { "Content-Type": "application/json" } },
        );
      }
    } else {
      const existing = (await sql`
        SELECT id FROM properties
        WHERE clerk_user_id = ${userId}
        ORDER BY created_at ASC
        LIMIT 1
      `) as Record<string, unknown>[];
      if (existing[0]) {
        propertyId = Number(existing[0].id);
      } else {
        const created = (await sql`
          INSERT INTO properties (clerk_user_id, nickname, property_type)
          VALUES (${userId}, 'My Home', 'house')
          RETURNING id
        `) as Record<string, unknown>[];
        propertyId = Number(created[0].id);
      }
    }

    const objectRows = (await sql`
      INSERT INTO property_objects (
        property_id, object_type, name, manufacturer, model, serial_number,
        room_location, purchase_date, purchase_price, warranty_expiration, status
      ) VALUES (
        ${propertyId}, 'other', ${item.name}, ${item.make}, ${item.model},
        ${item.serial_number}, ${item.storage_location}, ${item.purchase_date},
        ${item.purchase_price}, ${item.warranty_expiration}, 'active'
      )
      RETURNING *
    `) as Record<string, unknown>[];
    const objectId = Number(objectRows[0].id);

    const itemRows = (await sql`
      UPDATE garage_items SET home_object_id = ${objectId}
      WHERE id = ${data.item_id}
      RETURNING *
    `) as Record<string, unknown>[];

    const prop = await ownedHomeProperty(userId, propertyId);
    return {
      link: {
        object_id: objectId,
        object_name: (item.name as string) ?? "",
        object_type: "other",
        room_location: (item.storage_location as string | null) ?? null,
        property_id: propertyId,
        property_nickname: ((prop?.nickname as string | null) ?? "") || "My Home",
      } satisfies GarageLinkedHomeObject,
      item: toGarageItem(itemRows[0]),
    };
  });
