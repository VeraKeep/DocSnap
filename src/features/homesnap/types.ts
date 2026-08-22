/**
 * HomeSnap module — shared client types for the home-record UI.
 *
 * Mirrors the wire shapes returned by the feature's server functions
 * (src/features/homesnap/server.ts). A home record is organized around
 * `properties` (a home the user owns) and `PropertyObject`s (systems,
 * appliances, fixtures, improvements) that hang off a property. Each object
 * carries an attached `object_documents` list (receipts, manuals, photos…)
 * and an `object_events` timeline (installed → serviced → repaired).
 */

export type PropertyType = "house" | "condo" | "townhouse" | "apartment" | "other";
export type ObjectType =
  | "system"
  | "appliance"
  | "fixture"
  | "improvement"
  | "inventory"
  | "other";
export type ObjectStatus = "active" | "retired";
export type DocumentType =
  | "receipt"
  | "invoice"
  | "warranty"
  | "manual"
  | "photo"
  | "contract"
  | "other";
export type EventType = "installed" | "serviced" | "repaired" | "other";
/** Kind of recurring maintenance task (drives badge + optional suggestions). */
export type TaskType =
  | "filter"
  | "flush"
  | "battery"
  | "annual"
  | "inspection"
  | "clean"
  | "other";
/** The unit a maintenance interval is counted in. */
export type IntervalUnit = "days" | "months" | "years";

/**
 * High-level category for a home-inventory item (object_type "inventory") —
 * drives the filter/grouping in the inventory view. Insurance-friendly buckets
 * for the significant possessions a homeowner wants to record (TVs, computers,
 * furniture, tools, electronics, jewelry…).
 */
export type InventoryCategory =
  | "tv"
  | "computer"
  | "electronics"
  | "furniture"
  | "tools"
  | "jewelry"
  | "appliance"
  | "camera"
  | "other";

/** A home the user owns/maintains. */
export interface Property {
  id: number;
  nickname: string;
  property_type: PropertyType;
  purchase_date: string | null;
  purchase_price: number | null;
  created_at: string;
}

/** A tracked thing in the home (the PRD's central entity). */
export interface PropertyObject {
  id: number;
  property_id: number;
  object_type: ObjectType;
  name: string;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  room_location: string | null;
  purchase_date: string | null;
  installation_date: string | null;
  purchase_price: number | null;
  warranty_expiration: string | null;
  status: ObjectStatus;
  notes: string | null;
  /** Only set for object_type "inventory" — the insurance category of the item. */
  inventory_category: string | null;
  created_at: string;
}

/**
 * A home-inventory item (object_type "inventory") enriched for the cross-home
 * inventory list: its property's nickname (so each row is recognisable) and the
 * URL of its most recently attached photo (used as the thumbnail; null when
 * none is attached yet).
 */
export interface InventoryItem extends PropertyObject {
  property_nickname: string;
  photo_url: string | null;
}

/** A document (receipt/manual/photo…) attached to an object. */
export interface ObjectDocument {
  id: number;
  object_id: number;
  document_type: DocumentType;
  title: string | null;
  file_url: string;
  notes: string | null;
  created_at: string;
}

/** A timeline entry for an object. */
export interface ObjectEvent {
  id: number;
  object_id: number;
  event_type: EventType;
  occurred_on: string | null;
  title: string | null;
  notes: string | null;
  created_at: string;
}

/**
 * A recurring maintenance task on an object (e.g. "Main HVAC — replace filter
 * every 3 months"). next_due is the next scheduled date; marking the task done
 * sets last_done to "today" and advances next_due by the interval.
 */
export interface MaintenanceSchedule {
  id: number;
  object_id: number;
  task_type: TaskType;
  title: string | null;
  interval_value: number;
  interval_unit: IntervalUnit;
  last_done: string | null;
  next_due: string;
  notes: string | null;
  created_at: string;
}

/**
 * A maintenance schedule enriched with its owning object's name/type and its
 * property's nickname — used by the "Maintenance due / Coming up" view on the
 * HomeSnap home so each task is recognisable and can jump to its object.
 */
export interface MaintenanceDueItem extends MaintenanceSchedule {
  property_id: number;
  object_name: string;
  object_type: ObjectType;
  property_nickname: string;
}

/** Human labels for the enum-ish string columns (drives selects & badges). */
export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  house: "House",
  condo: "Condo",
  townhouse: "Townhouse",
  apartment: "Apartment",
  other: "Other",
};

export const OBJECT_TYPE_LABELS: Record<ObjectType, string> = {
  system: "System",
  appliance: "Appliance",
  fixture: "Fixture",
  improvement: "Improvement",
  inventory: "Inventory",
  other: "Other",
};

export const INVENTORY_CATEGORY_LABELS: Record<InventoryCategory, string> = {
  tv: "TV & A/V",
  computer: "Computer",
  electronics: "Electronics",
  furniture: "Furniture",
  tools: "Tools",
  jewelry: "Jewelry",
  appliance: "Appliance",
  camera: "Camera",
  other: "Other",
};

export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  receipt: "Receipt",
  invoice: "Invoice",
  warranty: "Warranty",
  manual: "Manual",
  photo: "Photo",
  contract: "Contract",
  other: "Other",
};

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  installed: "Installed",
  serviced: "Serviced",
  repaired: "Repaired",
  other: "Other",
};

export const TASK_TYPE_LABELS: Record<TaskType, string> = {
  filter: "Filter",
  flush: "Flush",
  battery: "Battery",
  annual: "Annual service",
  inspection: "Inspection",
  clean: "Cleaning",
  other: "Other",
};

export const INTERVAL_UNIT_LABELS: Record<IntervalUnit, string> = {
  days: "Days",
  months: "Months",
  years: "Years",
};

/** Coerce an unknown string into a known member (falling back to "other"). */
export function asObjectType(v: unknown): ObjectType {
  return typeof v === "string" && v in OBJECT_TYPE_LABELS
    ? (v as ObjectType)
    : "other";
}

export function asPropertyType(v: unknown): PropertyType {
  return typeof v === "string" && v in PROPERTY_TYPE_LABELS
    ? (v as PropertyType)
    : "other";
}

export function asDocumentType(v: unknown): DocumentType {
  return typeof v === "string" && v in DOCUMENT_TYPE_LABELS
    ? (v as DocumentType)
    : "other";
}

export function asEventType(v: unknown): EventType {
  return typeof v === "string" && v in EVENT_TYPE_LABELS
    ? (v as EventType)
    : "other";
}

export function asTaskType(v: unknown): TaskType {
  return typeof v === "string" && v in TASK_TYPE_LABELS
    ? (v as TaskType)
    : "other";
}

export function asIntervalUnit(v: unknown): IntervalUnit {
  return typeof v === "string" &&
    (v === "days" || v === "months" || v === "years")
    ? (v as IntervalUnit)
    : "months";
}

export function asInventoryCategory(v: unknown): InventoryCategory {
  return typeof v === "string" && v in INVENTORY_CATEGORY_LABELS
    ? (v as InventoryCategory)
    : "other";
}
