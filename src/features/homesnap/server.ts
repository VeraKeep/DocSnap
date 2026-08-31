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
import { hasHomeSnapAddon, findUserByEmail } from "~/subscription";
import {
  asActivityAction,
  asActivityEntityType,
  asDocumentType,
  asEventType,
  asIntervalUnit,
  asObjectType,
  asPropertyType,
  asShareRole,
  asTaskType,
  DOCUMENT_TYPE_LABELS,
  EVENT_TYPE_LABELS,
  OBJECT_TYPE_LABELS,
  SHARE_ROLE_LABELS,
  TASK_TYPE_LABELS,
  type ActivityAction,
  type ActivityEntityType,
  type AnalyticsData,
  type DocumentType,
  type EventType,
  type IntervalUnit,
  type HomeReportData,
  type InventoryItem,
  type MaintenanceDueItem,
  type MaintenanceSchedule,
  type ObjectDocument,
  type ObjectEvent,
  type ObjectStatus,
  type ObjectType,
  type Property,
  type PropertyAccessRole,
  type PropertyActivity,
  type PropertyObject,
  type PropertyShare,
  type PropertyType,
  type ReportEventItem,
  type ReportObjectItem,
  type ShareRole,
  type SpendByType,
  type SpendYearBucket,
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
    // Default to 'owner' for rows created via createProperty; listProperties
    // sets the true role from the share-aware query.
    access_role: (r.access_role as PropertyAccessRole) ?? "owner",
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
    cost: r.cost == null ? null : Number(r.cost),
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

function toShare(r: Record<string, unknown>): PropertyShare {
  return {
    id: Number(r.id),
    property_id: Number(r.property_id),
    grantee_user_id: (r.grantee_user_id as string) ?? "",
    grantee_email: (r.grantee_email as string | null) ?? null,
    role: asShareRole(r.role),
    created_at: String(r.created_at),
  };
}

function toActivity(r: Record<string, unknown>): PropertyActivity {
  return {
    id: Number(r.id),
    property_id: Number(r.property_id),
    actor_user_id: (r.actor_user_id as string) ?? "",
    actor_email: (r.actor_email as string | null) ?? null,
    action: asActivityAction(r.action),
    entity_type: asActivityEntityType(r.entity_type),
    entity_id: r.entity_id == null ? null : Number(r.entity_id),
    entity_label: (r.entity_label as string | null) ?? null,
    message: (r.message as string | null) ?? null,
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
/* Access-control helpers (owner OR active share)                       */
/* ------------------------------------------------------------------ */

/**
 * The caller's access level to a property, or null when they have none.
 * 'owner' = the property's creator (full access). 'edit'/'view' come from an
 * active property_shares row granting the caller that role. This is the single
 * choke point every HomeSnap read AND write funnels through, so a non-shared
 * user can never reach another owner's records.
 */
async function propertyAccessLevel(
  userId: string,
  propertyId: number,
): Promise<PropertyAccessRole | null> {
  const rows = (await sql`
    SELECT clerk_user_id FROM properties WHERE id = ${propertyId}
  `) as Record<string, unknown>[];
  const owner = rows[0]?.clerk_user_id as string | undefined;
  if (!owner) return null;
  if (owner === userId) return "owner";
  const shareRows = (await sql`
    SELECT role FROM property_shares
    WHERE property_id = ${propertyId} AND grantee_user_id = ${userId}
    LIMIT 1
  `) as Record<string, unknown>[];
  const role = shareRows[0]?.role;
  if (role === "edit") return "edit";
  if (role === "view") return "view";
  return null;
}

/**
 * Resolve the property a child row (object/document/event/schedule) hangs off
 * of, then check the caller's access to it. Returns the backing property id (so
 * callers can reuse it) or null if the row doesn't exist or the caller has no
 * access. Never resolves by bare child id across owners — always through the
 * property access boundary.
 */
async function childRowPropertyId(
  userId: string,
  table: string,
  fkColumn: string,
  rowId: number,
): Promise<number | null> {
  // table is a compile-time constant from the call sites below (never user
  // input), and fkColumn is likewise fixed per call — both are safe to splice
  // into the query string.
  const rows = (await sql`
    SELECT po.property_id
    FROM ${table} AS child
    JOIN property_objects po ON po.id = child.${fkColumn}
    WHERE child.id = ${rowId}
  `) as Record<string, unknown>[];
  if (!rows[0]) return null;
  const propertyId = Number(rows[0].property_id);
  const level = await propertyAccessLevel(userId, propertyId);
  if (!level) return null;
  return propertyId;
}

/** Returns the property row if the caller owns it, else null. */
async function ownedProperty(userId: string, propertyId: number) {
  const rows = (await sql`
    SELECT * FROM properties
    WHERE id = ${propertyId} AND clerk_user_id = ${userId}
  `) as Record<string, unknown>[];
  return rows[0] ?? null;
}

/** Throws 401 if the property isn't the caller's (owner-only gate). */
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
 * Throw if the caller cannot access the property (owner OR active share). When
 * `write` is true, a read-only ('view') member is rejected with 403 — only the
 * owner and 'edit' members may write. Returns the caller's level.
 */
async function requirePropertyAccess(
  userId: string,
  propertyId: number,
  write: boolean,
): Promise<PropertyAccessRole> {
  const level = await propertyAccessLevel(userId, propertyId);
  if (!level) {
    throw new Response(
      JSON.stringify({ error: "Property not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  if (write && level === "view") {
    throw new Response(
      JSON.stringify({
        error: "You have view-only access to this property — changes aren't allowed.",
      }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
  }
  return level;
}

/** Throw unless the caller can access (or write to) an object's property. */
async function requireChildAccess(
  userId: string,
  kind: "object" | "document" | "event" | "schedule",
  rowId: number,
  write: boolean,
): Promise<number> {
  const fkByKind: Record<string, string> = {
    object: "property_id", // not used; object resolves directly below
    document: "object_id",
    event: "object_id",
    schedule: "object_id",
  };
  let propertyId: number | null;
  if (kind === "object") {
    const rows = (await sql`
      SELECT property_id FROM property_objects WHERE id = ${rowId}
    `) as Record<string, unknown>[];
    propertyId = rows[0] ? Number(rows[0].property_id) : null;
  } else {
    const childTable: Record<string, string> = {
      document: "object_documents",
      event: "object_events",
      schedule: "maintenance_schedules",
    };
    propertyId = await childRowPropertyId(
      userId,
      childTable[kind],
      fkByKind[kind],
      rowId,
    );
  }
  if (propertyId == null) {
    throw new Response(
      JSON.stringify({ error: "Not found." }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }
  await requirePropertyAccess(userId, propertyId, write);
  return propertyId;
}

/* ------------------------------------------------------------------ */
/* Household activity log (append-only audit trail)                    */
/* ------------------------------------------------------------------ */
/**
 * Record ONE append-only activity row for a property's household log.
 *
 * This is the single internal helper every HomeSnap write action calls after a
 * successful change, so the history is complete and consistent (created /
 * updated / deleted object, document, event, maintenance schedule; maintenance
 * completed; share granted / revoked; property created). `actor_user_id` is
 * always the server-resolved current user (the owner or a shared household
 * member) — never caller-supplied. The display email is resolved at read time
 * (listActivity joins users), so we don't pay a lookup on every write.
 *
 * Recording is BEST-EFFORT and wrapped so it can NEVER break the underlying
 * write it describes — if the log insert fails, the action still succeeded.
 */
async function recordActivity(
  userId: string,
  a: {
    propertyId: number;
    action: ActivityAction;
    entityType: ActivityEntityType;
    entityId?: number | null;
    entityLabel?: string | null;
    message: string;
  },
): Promise<void> {
  if (!process.env.DATABASE_URL) return;
  try {
    await sql`
      INSERT INTO property_activity (
        property_id, actor_user_id, action, entity_type, entity_id,
        entity_label, message
      ) VALUES (
        ${a.propertyId}, ${userId}, ${a.action}, ${a.entityType},
        ${a.entityId ?? null}, ${a.entityLabel ?? null}, ${a.message}
      )
    `;
  } catch {
    // Best-effort: never fail a real write because the audit insert failed.
  }
}

/* ------------------------------------------------------------------ */
/* Properties                                                          */
/* ------------------------------------------------------------------ */

export const listProperties = createServerFn({ method: "GET" }).handler(async () => {
  const userId = await requireServerFunctionUser();
  await requireHomeSnapAddon(userId);
  if (!process.env.DATABASE_URL) return { configured: false, properties: [] };
  // The caller's OWN properties plus properties others have shared with them.
  // access_role is 'owner' for owned rows and the share role ('view'/'edit')
  // for shared rows — the UI uses it to decide whether to offer write actions
  // and the sharing panel.
  const rows = (await sql`
    SELECT p.*,
      CASE WHEN p.clerk_user_id = ${userId} THEN 'owner' ELSE ps.role END AS access_role
    FROM properties p
    LEFT JOIN property_shares ps
      ON ps.property_id = p.id AND ps.grantee_user_id = ${userId}
    WHERE p.clerk_user_id = ${userId} OR ps.id IS NOT NULL
    ORDER BY (p.clerk_user_id = ${userId}) DESC, p.created_at DESC, p.id DESC
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
    const propertyId = Number(rows[0].id);
    await recordActivity(userId, {
      propertyId,
      action: "created",
      entityType: "property",
      entityId: propertyId,
      entityLabel: data.nickname,
      message: `Added property "${data.nickname}".`,
    });
    return { property: toProperty(rows[0]) };
  });

/* ------------------------------------------------------------------ */
/* Sharing / household access                                          */
/* ------------------------------------------------------------------ */
/**
 * Share a property with another DocSnap user (by their email). Only the
 * property OWNER may share — a grantee who can edit a property must not be
 * able to extend access to other people. The email is resolved to the target
 * user's clerk_user_id (users.clerk_user_id); if the email doesn't match a
 * known DocSnap user, the share is rejected with a clear error. The grantee's
 * stored email is kept as a display snapshot. Re-sharing an already-shared
 * user updates their role. Gated HARD with requireHomeSnapAddon (fails closed).
 */
export const shareProperty = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { property_id?: unknown; grantee_email?: unknown; role?: unknown };
    return {
      property_id: positiveId(d.property_id, "Property id"),
      grantee_email: requiredText(d.grantee_email, "Email").slice(0, 300),
      role: asShareRole(d.role),
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedProperty(userId, data.property_id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const email = data.grantee_email.toLowerCase().trim();
    // Resolve the target user. They must exist as a DocSnap user before we can
    // grant them access.
    const granteeUserId = await findUserByEmail(email);
    if (!granteeUserId) {
      throw new Response(
        JSON.stringify({
          error: "We couldn't find a DocSnap account for that email.",
        }),
        { status: 404, headers: { "Content-Type": "application/json" } },
      );
    }
    if (granteeUserId === userId) {
      throw new Response(
        JSON.stringify({ error: "You can't share a property with yourself." }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    const rows = (await sql`
      INSERT INTO property_shares (property_id, grantee_user_id, grantee_email, role)
      VALUES (${data.property_id}, ${granteeUserId}, ${email}, ${data.role})
      ON CONFLICT (property_id, grantee_user_id)
      DO UPDATE SET role = ${data.role}, grantee_email = ${email}, created_at = NOW()
      RETURNING *
    `) as Record<string, unknown>[];
    const shareId = Number(rows[0].id);
    await recordActivity(userId, {
      propertyId: data.property_id,
      action: "shared",
      entityType: "share",
      entityId: shareId,
      entityLabel: email,
      message: `Shared this home with ${email} (${SHARE_ROLE_LABELS[data.role]}).`,
    });
    return { share: toShare(rows[0]) };
  });

/**
 * Stop sharing a property with a user. Owner-only. Returns the id of the removed
 * share row (or null if there was nothing to remove).
 */
export const revokeShare = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { property_id?: unknown; grantee_user_id?: unknown };
    return {
      property_id: positiveId(d.property_id, "Property id"),
      grantee_user_id: requiredText(d.grantee_user_id, "Grantee"),
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedProperty(userId, data.property_id);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const before = (await sql`
      SELECT id, grantee_email, role FROM property_shares
      WHERE property_id = ${data.property_id} AND grantee_user_id = ${data.grantee_user_id}
      LIMIT 1
    `) as Record<string, unknown>[];
    const rows = (await sql`
      DELETE FROM property_shares
      WHERE property_id = ${data.property_id} AND grantee_user_id = ${data.grantee_user_id}
      RETURNING id
    `) as Record<string, unknown>[];
    const removed = rows[0] ? Number(rows[0].id) : null;
    if (removed != null) {
      const email = (before[0]?.grantee_email as string | null) ?? data.grantee_user_id;
      const role = (before[0]?.role as ShareRole) ?? "view";
      await recordActivity(userId, {
        propertyId: data.property_id,
        action: "revoked",
        entityType: "share",
        entityId: removed,
        entityLabel: email,
        message: `Stopped sharing this home with ${email} (${SHARE_ROLE_LABELS[role]}).`,
      });
    }
    return { revoked: removed };
  });

/**
 * List the people a property is shared with (grantee email + role). Owner-only.
 */
export const listShares = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { property_id?: unknown };
    return { property_id: positiveId(d.property_id, "Property id") };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requireOwnedProperty(userId, data.property_id);
    if (!process.env.DATABASE_URL) return { configured: false, shares: [] };
    const rows = (await sql`
      SELECT * FROM property_shares
      WHERE property_id = ${data.property_id}
      ORDER BY created_at ASC
    `) as Record<string, unknown>[];
    return { configured: true, shares: rows.map(toShare) };
  });

/* ------------------------------------------------------------------ */
/* Activity log (household change history)                             */
/* ------------------------------------------------------------------ */
/**
 * Recent change history for one property, most-recent-first. Available to the
 * owner AND any shared member (view or edit) — it goes through the SAME
 * owner-or-share choke point (requirePropertyAccess) as every other HomeSnap
 * read, so a non-shared user gets 404 even guessing ids. Optionally filtered to
 * a single object's actions (entity_type='object' + entity_id). The actor's
 * display email is joined from users (null when unknown). Gated HARD with
 * requireHomeSnapAddon (fails closed) like every HomeSnap read. Append-only
 * history — recording happens server-side on every write action, never here.
 */
export const listActivity = createServerFn({ method: "POST" })
  .validator((data: unknown) => {
    const d = (data ?? {}) as { property_id?: unknown; object_id?: unknown; limit?: unknown };
    return {
      property_id: positiveId(d.property_id, "Property id"),
      object_id:
        d.object_id == null || d.object_id === ""
          ? null
          : positiveId(d.object_id, "Object id"),
      limit:
        d.limit == null
          ? 100
          : Math.min(Math.max(positiveId(d.limit, "Limit"), 1), 200),
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    await requirePropertyAccess(userId, data.property_id, false);
    if (!process.env.DATABASE_URL) return { configured: false, activities: [] };
    const rows = (await sql`
      SELECT pa.*, u.email AS actor_email
      FROM property_activity pa
      LEFT JOIN users u ON u.clerk_user_id = pa.actor_user_id
      WHERE pa.property_id = ${data.property_id}
        ${
          data.object_id != null
            ? sql`AND pa.entity_type = 'object' AND pa.entity_id = ${data.object_id}`
            : sql``
        }
      ORDER BY pa.created_at DESC, pa.id DESC
      LIMIT ${data.limit}
    `) as Record<string, unknown>[];
    return { configured: true, activities: rows.map(toActivity) };
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
    await requirePropertyAccess(userId, data.property_id, false);
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
    await requirePropertyAccess(userId, data.property_id, true);
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
    const objectId = Number(rows[0].id);
    const typeLabel = OBJECT_TYPE_LABELS[asObjectType(data.object_type)] ?? "Object";
    await recordActivity(userId, {
      propertyId: data.property_id,
      action: "created",
      entityType: "object",
      entityId: objectId,
      entityLabel: data.name,
      message: `Added ${typeLabel} "${data.name}".`,
    });
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
      await requirePropertyAccess(userId, propertyId, true);
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
    await recordActivity(userId, {
      propertyId,
      action: "created",
      entityType: "object",
      entityId: objectId,
      entityLabel: name,
      message: `Added Appliance "${name}" from ReceiptSnap receipt #${String(data.receipt_id)}.`,
    });
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
    const propertyId = await requireChildAccess(userId, "object", data.id, true);
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
    await recordActivity(userId, {
      propertyId,
      action: "updated",
      entityType: "object",
      entityId: data.id,
      entityLabel: data.name,
      message: `Updated ${OBJECT_TYPE_LABELS[asObjectType(data.object_type)] ?? "object"} "${data.name}".`,
    });
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
    const propertyId = await requireChildAccess(userId, "object", data.id, true);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const before = (await sql`
      SELECT name FROM property_objects WHERE id = ${data.id}
    `) as Record<string, unknown>[];
    const name = (before[0]?.name as string | null) ?? "object";
    await sql`DELETE FROM property_objects WHERE id = ${data.id}`;
    await recordActivity(userId, {
      propertyId,
      action: "deleted",
      entityType: "object",
      entityId: data.id,
      entityLabel: name,
      message: `Deleted "${name}".`,
    });
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
    WHERE po.object_type = 'inventory'
      AND (p.clerk_user_id = ${userId}
           OR p.id IN (SELECT property_id FROM property_shares WHERE grantee_user_id = ${userId}))
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
    await requireChildAccess(userId, "object", data.object_id, false);
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
    const propertyId = await requireChildAccess(userId, "object", data.object_id, true);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      INSERT INTO object_documents (object_id, document_type, title, file_url, notes)
      VALUES (${data.object_id}, ${data.document_type}, ${data.title}, ${data.file_url}, ${data.notes})
      RETURNING *
    `) as Record<string, unknown>[];
    const docId = Number(rows[0].id);
    const label = data.title ?? data.file_url;
    await recordActivity(userId, {
      propertyId,
      action: "created",
      entityType: "document",
      entityId: docId,
      entityLabel: label,
      message: `Attached ${DOCUMENT_TYPE_LABELS[asDocumentType(data.document_type)] ?? "document"} "${label}".`,
    });
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
    // Scope the document through its owning object/property before deleting —
    // the owner or an 'edit'-role grantee may remove it, never a bare id.
    const propertyId = await requireChildAccess(userId, "document", data.id, true);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const before = (await sql`
      SELECT title, document_type FROM object_documents WHERE id = ${data.id}
    `) as Record<string, unknown>[];
    const label = (before[0]?.title as string | null) ?? "document";
    await sql`DELETE FROM object_documents WHERE id = ${data.id}`;
    await recordActivity(userId, {
      propertyId,
      action: "deleted",
      entityType: "document",
      entityId: data.id,
      entityLabel: label,
      message: `Removed ${DOCUMENT_TYPE_LABELS[asDocumentType(before[0]?.document_type)] ?? "document"} "${label}".`,
    });
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
    await requireChildAccess(userId, "object", data.object_id, false);
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
      cost?: unknown;
    };
    return {
      object_id: positiveId(d.object_id, "Object id"),
      event_type: (text(d.event_type) ?? "other") as EventType,
      occurred_on: text(d.occurred_on)?.slice(0, 40) ?? null,
      title: text(d.title)?.slice(0, 300) ?? null,
      notes: text(d.notes)?.slice(0, 2000) ?? null,
      cost: price(d.cost),
    };
  })
  .handler(async ({ data }) => {
    const userId = await requireServerFunctionUser();
    await requireHomeSnapAddon(userId);
    const propertyId = await requireChildAccess(userId, "object", data.object_id, true);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const rows = (await sql`
      INSERT INTO object_events (object_id, event_type, occurred_on, title, notes, cost)
      VALUES (${data.object_id}, ${data.event_type}, ${data.occurred_on}, ${data.title}, ${data.notes}, ${data.cost})
      RETURNING *
    `) as Record<string, unknown>[];
    const eventId = Number(rows[0].id);
    const label = data.title ?? EVENT_TYPE_LABELS[asEventType(data.event_type)];
    await recordActivity(userId, {
      propertyId,
      action: "created",
      entityType: "event",
      entityId: eventId,
      entityLabel: label,
      message: `Added ${EVENT_TYPE_LABELS[asEventType(data.event_type)] ?? "timeline entry"} "${label}".`,
    });
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
    // Scope the event through its owning object/property before deleting — the
    // owner or an 'edit'-role grantee may remove it, never a bare id.
    const propertyId = await requireChildAccess(userId, "event", data.id, true);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const before = (await sql`
      SELECT title, event_type FROM object_events WHERE id = ${data.id}
    `) as Record<string, unknown>[];
    const label = (before[0]?.title as string | null) ?? "timeline entry";
    await sql`DELETE FROM object_events WHERE id = ${data.id}`;
    await recordActivity(userId, {
      propertyId,
      action: "deleted",
      entityType: "event",
      entityId: data.id,
      entityLabel: label,
      message: `Removed ${EVENT_TYPE_LABELS[asEventType(before[0]?.event_type)] ?? "timeline entry"} "${label}".`,
    });
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
    await requireChildAccess(userId, "object", data.object_id, false);
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
    const propertyId = await requireChildAccess(userId, "object", data.object_id, true);
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
    const scheduleId = Number(rows[0].id);
    const label = data.title ?? TASK_TYPE_LABELS[asTaskType(data.task_type)];
    await recordActivity(userId, {
      propertyId,
      action: "created",
      entityType: "schedule",
      entityId: scheduleId,
      entityLabel: label,
      message: `Scheduled maintenance "${label}".`,
    });
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
    const propertyId = await requireChildAccess(userId, "schedule", data.id, true);
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
    const label = data.title ?? TASK_TYPE_LABELS[asTaskType(data.task_type)];
    await recordActivity(userId, {
      propertyId,
      action: "updated",
      entityType: "schedule",
      entityId: data.id,
      entityLabel: label,
      message: `Updated maintenance "${label}".`,
    });
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
    const propertyId = await requireChildAccess(userId, "schedule", data.id, true);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const schRows = (await sql`
      SELECT interval_value, interval_unit, title, task_type FROM maintenance_schedules
      WHERE id = ${data.id}
    `) as Record<string, unknown>[];
    const sch = schRows[0];
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
    const label =
      (sch.title as string | null) ?? TASK_TYPE_LABELS[asTaskType(sch.task_type)];
    await recordActivity(userId, {
      propertyId,
      action: "completed",
      entityType: "schedule",
      entityId: data.id,
      entityLabel: label,
      message: `Completed maintenance "${label}" (next due ${nextDue}).`,
    });
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
    const propertyId = await requireChildAccess(userId, "schedule", data.id, true);
    if (!process.env.DATABASE_URL) {
      throw new Error("Storage isn't connected yet — DATABASE_URL is not set.");
    }
    const before = (await sql`
      SELECT title, task_type FROM maintenance_schedules WHERE id = ${data.id}
    `) as Record<string, unknown>[];
    const label =
      (before[0]?.title as string | null) ??
      TASK_TYPE_LABELS[asTaskType(before[0]?.task_type)];
    await sql`DELETE FROM maintenance_schedules WHERE id = ${data.id}`;
    await recordActivity(userId, {
      propertyId,
      action: "deleted",
      entityType: "schedule",
      entityId: data.id,
      entityLabel: label,
      message: `Removed maintenance "${label}".`,
    });
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
    WHERE (p.clerk_user_id = ${userId}
           OR p.id IN (SELECT property_id FROM property_shares WHERE grantee_user_id = ${userId}))
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
    await requireChildAccess(userId, "object", data.object_id, false);
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

/* ------------------------------------------------------------------ */
/* Improvement-log analytics & home-sale/insurance report               */
/* ------------------------------------------------------------------ */

/** Extract the first 4-digit year from a free-text date, else from fallback. */
function yearOf(dateText: string | null, fallbackIso: string): number {
  const m = /(?:19|20)\d{2}/.exec(dateText ?? "");
  if (m) return Number(m[0]);
  const fm = /(?:19|20)\d{2}/.exec(fallbackIso ?? "");
  return fm ? Number(fm[0]) : new Date().getFullYear();
}

/** Round a money sum to cents (floats from NUMERIC string coercion). */
function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Cross-home spend analytics: "everything I've spent on the house over time".
 * Aggregates only what the owner already recorded:
 *   - object spend — sum of property_objects.purchase_price, bucketed by
 *     calendar year and grouped by object type (improvements vs appliances vs
 *     systems …). The object's purchase date drives the year, falling back to
 *     installation date, then created_at.
 *   - event spend — sum of cost-bearing object_events (repair/service costs),
 *     bucketed by occurred_on (falling back to created_at).
 * Owner-scoped via the clerk_user_id join and gated HARD with
 * requireHomeSnapAddon (fails closed), like every HomeSnap read.
 */
export const getHomeAnalytics = createServerFn({ method: "GET" }).handler(async (): Promise<AnalyticsData> => {
  const userId = await requireServerFunctionUser();
  await requireHomeSnapAddon(userId);
  if (!process.env.DATABASE_URL) {
    return {
      configured: false,
      totalSpend: 0,
      objectSpend: 0,
      eventSpend: 0,
      eventCount: 0,
      byYear: [],
      byType: [],
    };
  }
  const objRows = (await sql`
    SELECT po.object_type, po.purchase_price, po.purchase_date,
           po.installation_date, po.created_at
    FROM property_objects po
    JOIN properties p ON p.id = po.property_id
    WHERE (p.clerk_user_id = ${userId}
           OR p.id IN (SELECT property_id FROM property_shares WHERE grantee_user_id = ${userId}))
  `) as Record<string, unknown>[];
  const evRows = (await sql`
    SELECT oe.event_type, oe.cost, oe.occurred_on, oe.created_at
    FROM object_events oe
    JOIN property_objects po ON po.id = oe.object_id
    JOIN properties p ON p.id = po.property_id
    WHERE (p.clerk_user_id = ${userId}
           OR p.id IN (SELECT property_id FROM property_shares WHERE grantee_user_id = ${userId}))
      AND oe.cost IS NOT NULL
  `) as Record<string, unknown>[];

  const yearMap = new Map<number, SpendYearBucket>();
  const typeMap = new Map<string, { objectSpend: number; count: number }>();
  const ensureYear = (y: number): SpendYearBucket => {
    let b = yearMap.get(y);
    if (!b) {
      b = { year: y, objectSpend: 0, eventSpend: 0, total: 0 };
      yearMap.set(y, b);
    }
    return b;
  };
  let objectSpend = 0;
  let eventSpend = 0;
  let eventCount = 0;

  for (const r of objRows) {
    const price = r.purchase_price == null ? 0 : Number(r.purchase_price);
    if (!(price > 0)) continue;
    objectSpend += price;
    const year = yearOf((r.purchase_date as string | null) ?? null, String(r.created_at));
    const b = ensureYear(year);
    b.objectSpend += price;
    b.total += price;
    const type = asObjectType(r.object_type);
    const t = typeMap.get(type) ?? { objectSpend: 0, count: 0 };
    t.objectSpend += price;
    t.count += 1;
    typeMap.set(type, t);
  }

  for (const r of evRows) {
    const cost = r.cost == null ? 0 : Number(r.cost);
    if (!(cost > 0)) continue;
    eventSpend += cost;
    eventCount += 1;
    const year = yearOf((r.occurred_on as string | null) ?? null, String(r.created_at));
    const b = ensureYear(year);
    b.eventSpend += cost;
    b.total += cost;
  }

  const byYear = Array.from(yearMap.values())
    .sort((a, b) => a.year - b.year)
    .map((b) => ({
      year: b.year,
      objectSpend: roundMoney(b.objectSpend),
      eventSpend: roundMoney(b.eventSpend),
      total: roundMoney(b.total),
    }));
  const byType: SpendByType[] = Array.from(typeMap.entries())
    .map(([t, v]) => ({
      object_type: asObjectType(t),
      objectSpend: roundMoney(v.objectSpend),
      count: v.count,
    }))
    .sort((a, b) => b.objectSpend - a.objectSpend);

  return {
    configured: true,
    totalSpend: roundMoney(objectSpend + eventSpend),
    objectSpend: roundMoney(objectSpend),
    eventSpend: roundMoney(eventSpend),
    eventCount,
    byYear,
    byType,
  };
});

/**
 * Printable home-sale / insurance report. Returns everything needed to render
 * a clean summary of the home's recorded improvements/repairs and their costs
 * — properties, objects (type/date/cost/warranty/status), cost-bearing events,
 * and running totals — built only from what's already recorded (nothing
 * fabricated). Owner-scoped via the clerk_user_id join and gated HARD with
 * requireHomeSnapAddon (fails closed).
 */
export const getHomeReport = createServerFn({ method: "GET" }).handler(async (): Promise<HomeReportData> => {
  const userId = await requireServerFunctionUser();
  await requireHomeSnapAddon(userId);
  if (!process.env.DATABASE_URL) {
    return {
      configured: false,
      generated_at: new Date().toISOString(),
      totalSpend: 0,
      objectSpend: 0,
      eventSpend: 0,
      properties: [],
      objects: [],
      events: [],
    };
  }
  const propRows = (await sql`
    SELECT id, nickname, property_type, purchase_date, purchase_price
    FROM properties
    WHERE clerk_user_id = ${userId}
      OR id IN (SELECT property_id FROM property_shares WHERE grantee_user_id = ${userId})
    ORDER BY created_at ASC
  `) as Record<string, unknown>[];
  const objRows = (await sql`
    SELECT po.id, po.property_id, p.nickname AS property_nickname, po.object_type,
           po.name, po.room_location, po.purchase_date, po.installation_date,
           po.purchase_price, po.warranty_expiration, po.status,
           COALESCE((SELECT SUM(oe.cost) FROM object_events oe WHERE oe.object_id = po.id), 0) AS event_spend
    FROM property_objects po
    JOIN properties p ON p.id = po.property_id
    WHERE (p.clerk_user_id = ${userId}
           OR p.id IN (SELECT property_id FROM property_shares WHERE grantee_user_id = ${userId}))
    ORDER BY p.created_at ASC, po.created_at ASC
  `) as Record<string, unknown>[];
  const evRows = (await sql`
    SELECT oe.id, oe.object_id, po.name AS object_name, oe.event_type,
           oe.occurred_on, oe.title, oe.cost
    FROM object_events oe
    JOIN property_objects po ON po.id = oe.object_id
    JOIN properties p ON p.id = po.property_id
    WHERE (p.clerk_user_id = ${userId}
           OR p.id IN (SELECT property_id FROM property_shares WHERE grantee_user_id = ${userId}))
      AND oe.cost IS NOT NULL
    ORDER BY oe.occurred_on ASC, oe.created_at ASC
  `) as Record<string, unknown>[];

  const objects: ReportObjectItem[] = objRows.map((r) => ({
    id: Number(r.id),
    property_id: Number(r.property_id),
    property_nickname: (r.property_nickname as string) ?? "",
    object_type: asObjectType(r.object_type),
    name: (r.name as string) ?? "",
    room_location: (r.room_location as string | null) ?? null,
    purchase_date: (r.purchase_date as string | null) ?? null,
    installation_date: (r.installation_date as string | null) ?? null,
    purchase_price: r.purchase_price == null ? null : Number(r.purchase_price),
    warranty_expiration: (r.warranty_expiration as string | null) ?? null,
    status: r.status === "retired" ? "retired" : "active",
    event_spend: roundMoney(Number(r.event_spend ?? 0)),
  }));
  const events: ReportEventItem[] = evRows.map((r) => ({
    id: Number(r.id),
    object_id: Number(r.object_id),
    object_name: (r.object_name as string) ?? "",
    event_type: asEventType(r.event_type),
    occurred_on: (r.occurred_on as string | null) ?? null,
    title: (r.title as string | null) ?? null,
    cost: r.cost == null ? null : Number(r.cost),
  }));

  const objectSpend = roundMoney(
    objects.reduce((s, o) => s + (o.purchase_price ?? 0), 0),
  );
  const eventSpend = roundMoney(events.reduce((s, e) => s + (e.cost ?? 0), 0));

  return {
    configured: true,
    generated_at: new Date().toISOString(),
    totalSpend: roundMoney(objectSpend + eventSpend),
    objectSpend,
    eventSpend,
    properties: propRows.map((r) => ({
      id: Number(r.id),
      nickname: (r.nickname as string) ?? "",
      property_type: asPropertyType(r.property_type),
      purchase_date: (r.purchase_date as string | null) ?? null,
      purchase_price: r.purchase_price == null ? null : Number(r.purchase_price),
    })),
    objects,
    events,
  };
});
