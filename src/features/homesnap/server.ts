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
 * NOTE — pricing/gating: HomeSnap's monetization (free vs paid add-on, like
 * ReceiptSnap's addon_receiptsnap flag) is a business decision that is NOT
 * decided yet (awaiting the owner). This phase ships the module auth-gated
 * only — signed-in users can use it. No hard gate is applied here.
 */
import { createServerFn } from "@tanstack/react-start";
import { sql } from "~/db";
import { requireServerFunctionUser } from "~/lib/server-auth";
import {
  asDocumentType,
  asEventType,
  asObjectType,
  asPropertyType,
  type DocumentType,
  type EventType,
  type ObjectDocument,
  type ObjectEvent,
  type ObjectStatus,
  type ObjectType,
  type Property,
  type PropertyObject,
  type PropertyType,
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
    created_at: String(r.created_at),
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

/* ------------------------------------------------------------------ */
/* Properties                                                          */
/* ------------------------------------------------------------------ */

export const listProperties = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireServerFunctionUser();
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
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireOwnedProperty(userId, data.property_id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      INSERT INTO property_objects (
        property_id, object_type, name, manufacturer, model, serial_number,
        room_location, purchase_date, installation_date, purchase_price,
        warranty_expiration, status, notes
      ) VALUES (
        ${data.property_id}, ${data.object_type}, ${data.name},
        ${data.manufacturer}, ${data.model}, ${data.serial_number},
        ${data.room_location}, ${data.purchase_date}, ${data.installation_date},
        ${data.purchase_price}, ${data.warranty_expiration}, ${data.status},
        ${data.notes}
      )
      RETURNING *
    `) as Record<string, unknown>[];
    return { object: toObject(rows[0]) };
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
