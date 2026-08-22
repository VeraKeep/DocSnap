/**
 * HomeSnap module — owner-scoped server functions.
 *
 * Every home record is personal data scoped to exactly one Clerk user. The
 * owner identity is resolved ONLY from the server session via the auth adapter
 * (src/lib/server-auth.ts); any caller-supplied owner ID is ignored. All
 * queries filter by the server-resolved owner, so no cross-user reads or leaks
 * are possible. Objects/documents/events are never queried straight by id —
 * every access is mediated through a property that must belong to the caller,
 * so an attacker cannot reach another user's records even guessing object or
 * property ids.
 *
 * Uses DocSnap's shared Neon connection helper (`~/db`) and the host schema
 * (src/db-schema.sql), and degrades gracefully to a no-op when DATABASE_URL is
 * unset (the UI reports storage as not configured rather than crashing).
 *
 * NOTE — pricing/gating (phase 3): HomeSnap is a paid add-on (business-plan
 * rev 2): $3.99/month or $39.99/year, gated by an addon_homesnap flag on the
 * user (mirroring ReceiptSnap/GarageSnap). Every read/write handler fails
 * CLOSED (HTTP 403) for a signed-in user who does not own the add-on. Pricing
 * is wired in src/modules.ts ($3.99/$39.99); the real Stripe checkout links
 * stay empty (src/moduleCheckout.ts) until the owner provides them — the gate
 * and UI work for flag-holding users regardless.
 */
import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/db";
import { requireServerFunctionUser } from "~/lib/server-auth";
import { hasHomeSnapAddon } from "~/subscription";
import {
  asDocumentType,
  asEventType,
  asIntervalUnit,
  asInventoryCategory,
  asObjectType,
  asPropertyType,
  asTaskType,
  type DocumentType,
  type EventType,
  type IntervalUnit,
  type InventoryItem,
  type MaintenanceDueItem,
  type MaintenanceSchedule,
  type ObjectDocument,
  type ObjectEvent,
  type ObjectStatus,
  type ObjectType,
  type Property,
  type PropertyObject,
  type PropertyType,
  type TaskType,
} from "./types";

/* ------------------------------------------------------------------ */
/* Row coercion helpers (sql returns Record<string, unknown>[])         */
/* ------------------------------------------------------------------ */

function toProperty(r: Record<string, unknown>): Property {
  return {
    id: Number(r.id),
    nickname: (r.nickname as string) ?? "",
    property_type: asPropertyType(r.property_type),
    purchase_date: (r.purchase_date as string | null) ?? null,
    purchase_price: r.purchase_price == null ? null : Number(r.purchase_price),
    created_at: String(r.created_at),
  };
}

function toObject(r: Record<string, unknown>): PropertyObject {
  return {
    id: Number(r.id),
    property_id: Number(r.property_id),
    object_type: asObjectType(r.object_type),
    name: (r.name as string) ?? "",
    manufacturer: (r.manufacturer as string | null) ?? null,
    model: (r.model as string | null) ?? null,
    serial_number: (r.serial_number as string | null) ?? null,
    room_location: (r.room_location as string | null) ?? null,
    purchase_date: (r.purchase_date as string | null) ?? null,
    installation_date: (r.installation_date as string | null) ?? null,
    purchase_price: r.purchase_price == null ? null : Number(r.purchase_price),
    warranty_expiration: (r.warranty_expiration as string | null) ?? null,
    status: r.status === "retired" ? "retired" : "active",
    notes: (r.notes as string | null) ?? null,
    inventory_category: (r.inventory_category as string | null) ?? null,
    created_at: String(r.created_at),
  };
}

/** Row coercion for a cross-home inventory item (adds property + photo URL). */
function toInventoryItem(r: Record<string, unknown>): InventoryItem {
  return {
    ...toObject(r),
    property_nickname: (r.property_nickname as string) ?? "",
    photo_url: (r.photo_url as string | null) ?? null,
  };
}

function toDocument(r: Record<string, unknown>): ObjectDocument {
  return {
    id: Number(r.id),
    object_id: Number(r.object_id),
    document_type: asDocumentType(r.document_type),
    title: (r.title as string | null) ?? null,
    file_url: (r.file_url as string) ?? "",
    notes: (r.notes as string | null) ?? null,
    created_at: String(r.created_at),
  };
}

function toEvent(r: Record<string, unknown>): ObjectEvent {
  return {
    id: Number(r.id),
    object_id: Number(r.object_id),
    event_type: asEventType(r.event_type),
    occurred_on: (r.occurred_on as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    notes: (r.notes as string | null) ?? null,
    created_at: String(r.created_at),
  };
}

function toSchedule(r: Record<string, unknown>): MaintenanceSchedule {
  return {
    id: Number(r.id),
    object_id: Number(r.object_id),
    task_type: asTaskType(r.task_type),
    title: (r.title as string | null) ?? null,
    interval_value: Number(r.interval_value),
    interval_unit: asIntervalUnit(r.interval_unit),
    last_done: (r.last_done as string | null) ?? null,
    next_due: (r.next_due as string) ?? "",
    notes: (r.notes as string | null) ?? null,
    created_at: String(r.created_at),
  };
}

function toDueItem(r: Record<string, unknown>): MaintenanceDueItem {
  return {
    ...toSchedule(r),
    property_id: Number(r.property_id),
    object_name: (r.object_name as string) ?? "",
    object_type: asObjectType(r.object_type),
    property_nickname: (r.property_nickname as string) ?? "",
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

/** A positive whole number for a maintenance interval (rejects 0/negative). */
function positiveInt(v: unknown): number {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error("Interval must be a positive whole number.");
  }
  return n;
}

/** Today's date as yyyy-mm-dd (UTC), matching the date-input format. */
function todayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Advance a yyyy-mm-dd date by an interval of days/months/years, returning the
 * result in the same format. If the input isn't a parseable date, it is
 * returned unchanged (callers fall back to a manual edit).
 */
function addInterval(
  iso: string,
  value: number,
  unit: IntervalUnit,
): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  if (unit === "days") d.setUTCDate(d.getUTCDate() + value);
  else if (unit === "years") d.setUTCFullYear(d.getUTCFullYear() + value);
  else d.setUTCMonth(d.getUTCMonth() + value); // months
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/* ------------------------------------------------------------------ */
/* Add-on entitlement gate (phase 3)                                    */
/* ------------------------------------------------------------------ */

/** Clear, honest message for users without the add-on. */
export const ADDON_LOCKED_MESSAGE =
  "HomeSnap is a paid add-on — purchase it to unlock.";
/** Machine-readable code the UI can use to render the locked/upgrade screen. */
export const ADDON_LOCKED_CODE = "homesnap_addon_required";

/**
 * HARD entitlement gate (business-plan rev 2). HomeSnap is a paid add-on, NOT
 * bundled into any DocSnap tier. Fails CLOSED with HTTP 403 for any signed-in
 * user who does not own the add-on — including every paid
 * (Personal/Household/Complete) subscriber. Anonymous callers are already
 * rejected with 401 by requireServerFunctionUser.
 */
async function requireHomeSnapAddon(userId: string): Promise<void> {
  const owned = await hasHomeSnapAddon(userId);
  if (!owned) {
    throw new Response(
      JSON.stringify({ error: ADDON_LOCKED_MESSAGE, code: ADDON_LOCKED_CODE }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
}

/**
 * HomeSnap entitlement for the signed-in user. This is the UI's gate channel
 * (does not throw for a locked user — it reports the state). `hasAddon` is
 * true only when the user owns the add-on. Anonymous → 401 (fail closed).
 */
export const getHomeEntitlement = createServerFn({ method: "GET" }).handler(async (): Promise<{ configured: boolean; hasAddon: boolean }> => {
  const userId = await requireServerFunctionUser();
  if (!process.env.DATABASE_URL) return { configured: false, hasAddon: false };
  const hasAddon = await hasHomeSnapAddon(userId);
  return { configured: true, hasAddon };
});

/* ------------------------------------------------------------------ */
/* Ownership helpers                                                   */
/* ------------------------------------------------------------------ */

/** Returns the property row if it belongs to the caller, else null. */
async function ownedProperty(userId: string, propertyId: number) {
  const rows = (await sql`
    SELECT * FROM properties
    WHERE id = ${propertyId} AND clerk_user_id = ${userId}
  `) as Record<string, unknown>[];
  return rows[0] ?? null;
}

/** Throws 401 if the property isn't the caller's. */
async function requireOwnedProperty(
  userId: string,
  propertyId: number,
): Promise<Record<string, unknown>> {
  const prop = await ownedProperty(userId, propertyId);
  if (!prop) {
    throw new Response(
      JSON.stringify({ error: "Property not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  return prop;
}

/**
 * Returns the object row if it belongs to an owned property, else null. The
 * join to properties (filtered by clerk_user_id) is the scoping boundary — a
 * caller can only ever touch objects beneath their own properties.
 */
async function ownedObject(userId: string, objectId: number) {
  const rows = (await sql`
    SELECT po.* FROM property_objects po
    JOIN properties p ON p.id = po.property_id
    WHERE po.id = ${objectId} AND p.clerk_user_id = ${userId}
  `) as Record<string, unknown>[];
  return rows[0] ?? null;
}

async function requireOwnedObject(
  userId: string,
  objectId: number,
): Promise<Record<string, unknown>> {
  const obj = await ownedObject(userId, objectId);
  if (!obj) {
    throw new Response(
      JSON.stringify({ error: "Object not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  return obj;
}

/**
 * Returns the maintenance schedule row if it sits beneath an owned object (and
 * thus an owned property), else null. The join chain to properties (filtered by
 * clerk_user_id) is the scoping boundary — a caller can only ever touch
 * schedules attached to their own objects.
 */
async function ownedSchedule(userId: string, scheduleId: number) {
  const rows = (await sql`
    SELECT ms.* FROM maintenance_schedules ms
    JOIN property_objects po ON po.id = ms.object_id
    JOIN properties p ON p.id = po.property_id
    WHERE ms.id = ${scheduleId} AND p.clerk_user_id = ${userId}
  `) as Record<string, unknown>[];
  return rows[0] ?? null;
}

async function requireOwnedSchedule(
  userId: string,
  scheduleId: number,
): Promise<Record<string, unknown>> {
  const sch = await ownedSchedule(userId, scheduleId);
  if (!sch) {
    throw new Response(
      JSON.stringify({ error: "Maintenance schedule not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  return sch;
}

/* ------------------------------------------------------------------ */
/* Properties                                                          */
/* ------------------------------------------------------------------ */

export const listProperties = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireServerFunctionUser();
  await requireHomeSnapAddon(userId);
  if (!process.env.DATABASE_URL) return { configured: false, properties: [] };
  const rows = (await sql`
    SELECT * FROM properties
    WHERE clerk_user_id = ${userId}
    ORDER BY created_at DESC
  `) as Record<string, unknown>[];
  return { configured: true, properties: rows.map(toProperty) };
});

export const createProperty = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      nickname?: unknown;
      property_type?: unknown;
      purchase_date?: unknown;
      purchase_price?: unknown;
    };
    return {
      nickname: requiredText(d.nickname, "Nickname").slice(0, 200),
      property_type: (text(d.property_type) ?? "house") as PropertyType,
      purchase_date: text(d.purchase_date)?.slice(0, 40) ?? null,
      purchase_price: price(d.purchase_price),
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      INSERT INTO properties (clerk_user_id, nickname, property_type, purchase_date, purchase_price)
      VALUES (${userId}, ${data.nickname}, ${data.property_type}, ${data.purchase_date}, ${data.purchase_price})
      RETURNING *
    `) as Record<string, unknown>[];
    return { property: toProperty(rows[0]) };
  });

/* ------------------------------------------------------------------ */
/* Objects                                                             */
/* ------------------------------------------------------------------ */

export const listObjects = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { property_id?: unknown };
    return { property_id: positiveId(d.property_id, "Property id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedProperty(userId, data.property_id);
    if (!process.env.DATABASE_URL) return { configured: false, objects: [] };
    const rows = (await sql`
      SELECT * FROM property_objects
      WHERE property_id = ${data.property_id}
      ORDER BY created_at DESC
    `) as Record<string, unknown>[];
    return { configured: true, objects: rows.map(toObject) };
  });

export const createObject = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      property_id?: unknown;
      object_type?: unknown;
      name?: unknown;
      manufacturer?: unknown;
      model?: unknown;
      serial_number?: unknown;
      room_location?: unknown;
      purchase_date?: unknown;
      installation_date?: unknown;
      purchase_price?: unknown;
      warranty_expiration?: unknown;
      status?: unknown;
      notes?: unknown;
      inventory_category?: unknown;
    };
    const status: ObjectStatus = d.status === "retired" ? "retired" : "active";
    return {
      property_id: positiveId(d.property_id, "Property id"),
      object_type: (text(d.object_type) ?? "other") as ObjectType,
      name: requiredText(d.name, "Object name").slice(0, 300),
      manufacturer: text(d.manufacturer)?.slice(0, 200) ?? null,
      model: text(d.model)?.slice(0, 200) ?? null,
      serial_number: text(d.serial_number)?.slice(0, 200) ?? null,
      room_location: text(d.room_location)?.slice(0, 200) ?? null,
      purchase_date: text(d.purchase_date)?.slice(0, 40) ?? null,
      installation_date: text(d.installation_date)?.slice(0, 40) ?? null,
      purchase_price: price(d.purchase_price),
      warranty_expiration: text(d.warranty_expiration)?.slice(0, 40) ?? null,
      status,
      notes: text(d.notes)?.slice(0, 2000) ?? null,
      inventory_category: text(d.inventory_category)?.slice(0, 40) ?? null,
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedProperty(userId, data.property_id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      INSERT INTO property_objects (
        property_id, object_type, name, manufacturer, model, serial_number,
        room_location, purchase_date, installation_date, purchase_price,
        warranty_expiration, status, notes, inventory_category
      ) VALUES (
        ${data.property_id}, ${data.object_type}, ${data.name},
        ${data.manufacturer}, ${data.model}, ${data.serial_number},
        ${data.room_location}, ${data.purchase_date}, ${data.installation_date},
        ${data.purchase_price}, ${data.warranty_expiration}, ${data.status},
        ${data.notes}, ${data.inventory_category}
      )
      RETURNING *
    `) as Record<string, unknown>[];
    return { object: toObject(rows[0]) };
  });

/* ------------------------------------------------------------------ */
/* ReceiptSnap → HomeSnap integration                                  */
/* ------------------------------------------------------------------ */
/**
 * Create a HomeSnap appliance object from a ReceiptSnap receipt, and attach
 * that receipt to it. This is the single server action behind the "Add this
 * appliance to HomeSnap?" action in the ReceiptSnap receipt detail view.
 *
 * Mapping receipt → home object:
 *   - object_type      → "appliance"
 *   - name             → first line item's product name (fall back to the
 *                        merchant, then a generic "purchase" label)
 *   - manufacturer     → line-item/extra "manufacturer" or "brand"
 *   - model            → line-item/extra "model"
 *   - serial_number    → line-item/extra "serial" (or first serial number)
 *   - purchase_price   → the receipt's total
 *   - purchase_date    → the receipt's store date
 *
 * The receipt image is attached as a document (document_type = receipt) via
 * the authenticated /api/receipts/:id/image endpoint, so no heavy base64 is
 * duplicated into the object_documents row — the receipt stays the single
 * source of truth in the receipts table.
 *
 * The object must live under a property. If the caller passes an owned
 * property_id, it is used; otherwise the user's first property is reused, and
 * if they have no property yet one ("My Home") is created automatically.
 *
 * Gated HARD with the same addon_homesnap entitlement as every other HomeSnap
 * write (fails CLOSED with 403 for users who don't own the add-on).
 */
export const createObjectFromReceipt = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { receipt_id?: unknown; property_id?: unknown };
    return {
      receipt_id: positiveId(d.receipt_id, "Receipt id"),
      property_id:
        d.property_id == null || d.property_id === ""
          ? null
          : positiveId(d.property_id, "Property id"),
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    // The receipt must belong to the caller — never read others' receipts.
    const receiptRows = (await sql`
      SELECT * FROM receipts
      WHERE id = ${data.receipt_id} AND clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    if (!receiptRows[0]) {
      throw new Response(
        JSON.stringify({ error: "Receipt not found." }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    const receipt = receiptRows[0];
    const merchant = text(receipt.merchant);
    let items: Record<string, unknown>[] = [];
    try {
      const parsed = JSON.parse(String(receipt.items ?? "[]") || "[]");
      if (Array.isArray(parsed)) items = parsed as Record<string, unknown>[];
    } catch {
      items = [];
    }
    let extra: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(String(receipt.extra ?? "{}") || "{}");
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        extra = parsed as Record<string, unknown>;
      }
    } catch {
      extra = {};
    }
    const first = items[0] ?? {};
    const productName = text(first.name);
    const name = (
      productName ??
      (merchant ? `${merchant} purchase` : null) ??
      "Home purchase"
    ).slice(0, 300);
    const manufacturer = (
      text(first.manufacturer) ??
      text(extra.manufacturer) ??
      text(extra.brand)
    )?.slice(0, 200) ?? null;
    const model = (text(first.model) ?? text(extra.model))?.slice(0, 200) ?? null;
    const serial =
      (text(first.serial) ??
        (Array.isArray(extra.serial_numbers)
          ? text(extra.serial_numbers[0])
          : null))?.slice(0, 200) ?? null;
    const purchasePrice = price(receipt.total);
    const purchaseDate = text(receipt.store_date)?.slice(0, 40) ?? null;

    // Resolve (or create) the property the object will live under.
    let propertyId = data.property_id;
    if (propertyId != null) {
      await requireOwnedProperty(userId, propertyId);
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
        purchase_date, purchase_price, status
      ) VALUES (
        ${propertyId}, 'appliance', ${name}, ${manufacturer}, ${model},
        ${serial}, ${purchaseDate}, ${purchasePrice}, 'active'
      )
      RETURNING *
    `) as Record<string, unknown>[];
    const objectId = Number(objectRows[0].id);
    await sql`
      INSERT INTO object_documents (object_id, document_type, title, file_url, notes)
      VALUES (
        ${objectId}, 'receipt',
        ${merchant ? `${merchant} receipt` : "Purchase receipt"},
        ${`/api/receipts/${String(data.receipt_id)}/image`},
        ${`Imported from ReceiptSnap receipt #${String(data.receipt_id)}.`}
      )
    `;
    return {
      configured: true,
      object: toObject(objectRows[0]),
      property_id: propertyId,
    };
  });
export const updateObject = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      id?: unknown;
      object_type?: unknown;
      name?: unknown;
      manufacturer?: unknown;
      model?: unknown;
      serial_number?: unknown;
      room_location?: unknown;
      purchase_date?: unknown;
      installation_date?: unknown;
      purchase_price?: unknown;
      warranty_expiration?: unknown;
      status?: unknown;
      notes?: unknown;
      inventory_category?: unknown;
    };
    const status: ObjectStatus = d.status === "retired" ? "retired" : "active";
    return {
      id: positiveId(d.id, "Object id"),
      object_type: (text(d.object_type) ?? "other") as ObjectType,
      name: requiredText(d.name, "Object name").slice(0, 300),
      manufacturer: text(d.manufacturer)?.slice(0, 200) ?? null,
      model: text(d.model)?.slice(0, 200) ?? null,
      serial_number: text(d.serial_number)?.slice(0, 200) ?? null,
      room_location: text(d.room_location)?.slice(0, 200) ?? null,
      purchase_date: text(d.purchase_date)?.slice(0, 40) ?? null,
      installation_date: text(d.installation_date)?.slice(0, 40) ?? null,
      purchase_price: price(d.purchase_price),
      warranty_expiration: text(d.warranty_expiration)?.slice(0, 40) ?? null,
      status,
      notes: text(d.notes)?.slice(0, 2000) ?? null,
      inventory_category: text(d.inventory_category)?.slice(0, 40) ?? null,
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedObject(userId, data.id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      UPDATE property_objects SET
        object_type = ${data.object_type},
        name = ${data.name},
        manufacturer = ${data.manufacturer},
        model = ${data.model},
        serial_number = ${data.serial_number},
        room_location = ${data.room_location},
        purchase_date = ${data.purchase_date},
        installation_date = ${data.installation_date},
        purchase_price = ${data.purchase_price},
        warranty_expiration = ${data.warranty_expiration},
        status = ${data.status},
        notes = ${data.notes},
        inventory_category = ${data.inventory_category}
      WHERE id = ${data.id}
      RETURNING *
    `) as Record<string, unknown>[];
    if (!rows[0]) throw new Error("Object not found.");
    return { object: toObject(rows[0]) };
  });

export const deleteObject = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    return { id: positiveId(d.id, "Object id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedObject(userId, data.id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    await sql`DELETE FROM property_objects WHERE id = ${data.id}`;
    return { deleted: true };
  });

/* ------------------------------------------------------------------ */
/* Home inventory (object_type "inventory")                            */
/* ------------------------------------------------------------------ */

/**
 * All home-inventory items across the user's properties. An inventory item is
 * just a PropertyObject with object_type = "inventory" plus an
 * inventory_category, so it reuses every existing object field (name,
 * manufacturer/model/serial, location, purchase date/price, status) and the
 * documents/photos/receipts attached via object_documents. This action returns
 * each one enriched with its property's nickname and the URL of its most
 * recently attached photo (for the list thumbnail), so the inventory view is a
 * single call. Gated HARD with requireHomeSnapAddon (fails closed) like every
 * other HomeSnap read.
 */
export const listInventory = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await requireServerFunctionUser();
  await requireHomeSnapAddon(userId);
  if (!process.env.DATABASE_URL) return { configured: false, items: [] };
  const rows = (await sql`
    SELECT po.*, p.nickname AS property_nickname,
      (SELECT od.file_url FROM object_documents od
        WHERE od.object_id = po.id AND od.document_type = 'photo'
        ORDER BY od.created_at DESC LIMIT 1) AS photo_url
    FROM property_objects po
    JOIN properties p ON p.id = po.property_id
    WHERE po.object_type = 'inventory' AND p.clerk_user_id = ${userId}
    ORDER BY po.created_at DESC
  `) as Record<string, unknown>[];
  return { configured: true, items: rows.map(toInventoryItem) };
});

/* ------------------------------------------------------------------ */
/* Documents                                                           */
/* ------------------------------------------------------------------ */

export const listDocuments = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { object_id?: unknown };
    return { object_id: positiveId(d.object_id, "Object id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedObject(userId, data.object_id);
    if (!process.env.DATABASE_URL) return { configured: false, documents: [] };
    const rows = (await sql`
      SELECT * FROM object_documents
      WHERE object_id = ${data.object_id}
      ORDER BY created_at DESC
    `) as Record<string, unknown>[];
    return { configured: true, documents: rows.map(toDocument) };
  });

export const createDocument = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      object_id?: unknown;
      document_type?: unknown;
      title?: unknown;
      file_url?: unknown;
      notes?: unknown;
    };
    return {
      object_id: positiveId(d.object_id, "Object id"),
      document_type: (text(d.document_type) ?? "other") as DocumentType,
      title: text(d.title)?.slice(0, 300) ?? null,
      file_url: requiredText(d.file_url, "Document link"),
      notes: text(d.notes)?.slice(0, 2000) ?? null,
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedObject(userId, data.object_id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      INSERT INTO object_documents (object_id, document_type, title, file_url, notes)
      VALUES (${data.object_id}, ${data.document_type}, ${data.title}, ${data.file_url}, ${data.notes})
      RETURNING *
    `) as Record<string, unknown>[];
    return { document: toDocument(rows[0]) };
  });

export const deleteDocument = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    return { id: positiveId(d.id, "Document id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    // Scope the document through its owning object (which must belong to an
    // owned property) before deleting — never delete by bare id.
    const doc = (await sql`
      SELECT od.id FROM object_documents od
      JOIN property_objects po ON po.id = od.object_id
      JOIN properties p ON p.id = po.property_id
      WHERE od.id = ${data.id} AND p.clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    if (!doc[0]) {
      throw new Response(
        JSON.stringify({ error: "Document not found." }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    await sql`DELETE FROM object_documents WHERE id = ${data.id}`;
    return { deleted: true };
  });

/* ------------------------------------------------------------------ */
/* Events (timeline)                                                   */
/* ------------------------------------------------------------------ */

export const listEvents = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { object_id?: unknown };
    return { object_id: positiveId(d.object_id, "Object id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedObject(userId, data.object_id);
    if (!process.env.DATABASE_URL) return { configured: false, events: [] };
    const rows = (await sql`
      SELECT * FROM object_events
      WHERE object_id = ${data.object_id}
      ORDER BY created_at ASC
    `) as Record<string, unknown>[];
    return { configured: true, events: rows.map(toEvent) };
  });

export const createEvent = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      object_id?: unknown;
      event_type?: unknown;
      occurred_on?: unknown;
      title?: unknown;
      notes?: unknown;
    };
    return {
      object_id: positiveId(d.object_id, "Object id"),
      event_type: (text(d.event_type) ?? "other") as EventType,
      occurred_on: text(d.occurred_on)?.slice(0, 40) ?? null,
      title: text(d.title)?.slice(0, 300) ?? null,
      notes: text(d.notes)?.slice(0, 2000) ?? null,
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedObject(userId, data.object_id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      INSERT INTO object_events (object_id, event_type, occurred_on, title, notes)
      VALUES (${data.object_id}, ${data.event_type}, ${data.occurred_on}, ${data.title}, ${data.notes})
      RETURNING *
    `) as Record<string, unknown>[];
    return { event: toEvent(rows[0]) };
  });

export const deleteEvent = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    return { id: positiveId(d.id, "Event id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    // Scope the event through its owning object/property before deleting.
    const ev = (await sql`
      SELECT oe.id FROM object_events oe
      JOIN property_objects po ON po.id = oe.object_id
      JOIN properties p ON p.id = po.property_id
      WHERE oe.id = ${data.id} AND p.clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    if (!ev[0]) {
      throw new Response(
        JSON.stringify({ error: "Event not found." }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    await sql`DELETE FROM object_events WHERE id = ${data.id}`;
    return { deleted: true };
  });

/* ------------------------------------------------------------------ */
/* Maintenance schedules (recurring tasks on an object)                 */
/* ------------------------------------------------------------------ */

/** List the maintenance schedules for one (owned) object. */
export const listSchedules = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { object_id?: unknown };
    return { object_id: positiveId(d.object_id, "Object id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedObject(userId, data.object_id);
    if (!process.env.DATABASE_URL) return { configured: false, schedules: [] };
    const rows = (await sql`
      SELECT * FROM maintenance_schedules
      WHERE object_id = ${data.object_id}
      ORDER BY next_due ASC, created_at ASC
    `) as Record<string, unknown>[];
    return { configured: true, schedules: rows.map(toSchedule) };
  });

/**
 * Create a maintenance schedule (recurring task) on an object. The owner
 * supplies the label/kind, the interval (value + unit), and when it's next due
 * (optionally when it was last done). Marking a task done later advances
 * next_due by the interval — see completeSchedule.
 */
export const createSchedule = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      object_id?: unknown;
      task_type?: unknown;
      title?: unknown;
      interval_value?: unknown;
      interval_unit?: unknown;
      next_due?: unknown;
      last_done?: unknown;
      notes?: unknown;
    };
    return {
      object_id: positiveId(d.object_id, "Object id"),
      task_type: (text(d.task_type) ?? "other") as TaskType,
      title: text(d.title)?.slice(0, 300) ?? null,
      interval_value: positiveInt(d.interval_value),
      interval_unit: (text(d.interval_unit) ?? "months") as IntervalUnit,
      next_due: requiredText(d.next_due, "Next due date").slice(0, 40),
      last_done: text(d.last_done)?.slice(0, 40) ?? null,
      notes: text(d.notes)?.slice(0, 1000) ?? null,
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedObject(userId, data.object_id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      INSERT INTO maintenance_schedules (
        object_id, task_type, title, interval_value, interval_unit,
        last_done, next_due, notes
      ) VALUES (
        ${data.object_id}, ${data.task_type}, ${data.title},
        ${data.interval_value}, ${data.interval_unit},
        ${data.last_done}, ${data.next_due}, ${data.notes}
      )
      RETURNING *
    `) as Record<string, unknown>[];
    return { schedule: toSchedule(rows[0]) };
  });

/** Update a schedule's fields (label/kind/interval/dates/notes). */
export const updateSchedule = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as {
      id?: unknown;
      task_type?: unknown;
      title?: unknown;
      interval_value?: unknown;
      interval_unit?: unknown;
      next_due?: unknown;
      last_done?: unknown;
      notes?: unknown;
    };
    return {
      id: positiveId(d.id, "Schedule id"),
      task_type: (text(d.task_type) ?? "other") as TaskType,
      title: text(d.title)?.slice(0, 300) ?? null,
      interval_value: positiveInt(d.interval_value),
      interval_unit: (text(d.interval_unit) ?? "months") as IntervalUnit,
      next_due: requiredText(d.next_due, "Next due date").slice(0, 40),
      last_done: text(d.last_done)?.slice(0, 40) ?? null,
      notes: text(d.notes)?.slice(0, 1000) ?? null,
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedSchedule(userId, data.id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      UPDATE maintenance_schedules SET
        task_type = ${data.task_type},
        title = ${data.title},
        interval_value = ${data.interval_value},
        interval_unit = ${data.interval_unit},
        next_due = ${data.next_due},
        last_done = ${data.last_done},
        notes = ${data.notes}
      WHERE id = ${data.id}
      RETURNING *
    `) as Record<string, unknown>[];
    if (!rows[0]) throw new Error("Schedule not found.");
    return { schedule: toSchedule(rows[0]) };
  });

/**
 * Mark a maintenance task done. Sets last_done to the current date and advances
 * next_due by the schedule's interval (e.g. a "replace filter every 3 months"
 * task done today becomes next due three months from today).
 */
export const completeSchedule = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    return { id: positiveId(d.id, "Schedule id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    const sch = await requireOwnedSchedule(userId, data.id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const lastDone = todayIso();
    const nextDue = addInterval(
      lastDone,
      Number(sch.interval_value),
      asIntervalUnit(sch.interval_unit),
    );
    const rows = (await sql`
      UPDATE maintenance_schedules
      SET last_done = ${lastDone}, next_due = ${nextDue}
      WHERE id = ${data.id}
      RETURNING *
    `) as Record<string, unknown>[];
    return { schedule: toSchedule(rows[0]), last_done: lastDone, next_due: nextDue };
  });

export const deleteSchedule = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { id?: unknown };
    return { id: positiveId(d.id, "Schedule id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedSchedule(userId, data.id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    await sql`DELETE FROM maintenance_schedules WHERE id = ${data.id}`;
    return { deleted: true };
  });

/**
 * All maintenance schedules across the user's properties, enriched with the
 * owning object's name/type and the property nickname, ordered by next_due so
 * the "Maintenance due / Coming up" home view can bucket and sort them.
 */
export const listDueMaintenance = createServerFn({ method: "POST" }).handler(async () => {
  const userId = await requireServerFunctionUser();
  await requireHomeSnapAddon(userId);
  if (!process.env.DATABASE_URL) return { configured: false, schedules: [] };
  const rows = (await sql`
    SELECT ms.*, p.id AS property_id, po.name AS object_name, po.object_type, p.nickname AS property_nickname
    FROM maintenance_schedules ms
    JOIN property_objects po ON po.id = ms.object_id
    JOIN properties p ON p.id = po.property_id
    WHERE p.clerk_user_id = ${userId}
    ORDER BY ms.next_due ASC, ms.created_at ASC
  `) as Record<string, unknown>[];
  return { configured: true, schedules: rows.map(toDueItem) };
});

/* ------------------------------------------------------------------ */
/* GarageSnap ↔ HomeSnap object sharing (HomeSnap read side)           */
/* ------------------------------------------------------------------ */
/**
 * Fetch the GarageSnap item linked to a home object (if any), with its storage
 * location, so HomeSnap can surface that the same physical item is also tracked
 * in GarageSnap. Read-only/navigation — the reverse direction (GarageSnap
 * linking to a home object) lives in the GarageSnap module. Owner-safe: the
 * home object must belong to the caller, and the joined garage row is scope-
 * guarded by the same clerk_user_id. Gated HARD with requireHomeSnapAddon
 * (fails closed) like every HomeSnap read.
 */
export const getHomeObjectGarageLink = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { object_id?: unknown };
    return { object_id: positiveId(d.object_id, "Object id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedObject(userId, data.object_id);
    if (!process.env.DATABASE_URL) return { linked: false, link: null };
    const rows = (await sql`
      SELECT gi.id AS item_id, gi.name AS item_name, gi.storage_location
      FROM garage_items gi
      WHERE gi.home_object_id = ${data.object_id} AND gi.clerk_user_id = ${userId}
    `) as Record<string, unknown>[];
    if (!rows[0]) return { linked: false, link: null };
    const r = rows[0];
    return {
      linked: true,
      link: {
        item_id: Number(r.item_id),
        item_name: (r.item_name as string) ?? "",
        storage_location: (r.storage_location as string | null) ?? null,
      },
    };
  });
