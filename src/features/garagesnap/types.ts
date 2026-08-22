/**
 * GarageSnap module — shared client types for the workshop-inventory UI.
 *
 * Mirrors the wire shapes returned by the feature's server functions
 * (src/features/garagesnap/server.ts). A garage item is a single, flat,
 * owner-scoped record (tools/equipment) — no nested properties/objects like
 * HomeSnap. Each row carries make/model/serial, a photo, purchase info, a
 * warranty-expiry, its storage location, and an optional cross-module link to
 * a HomeSnap home object (see `home_object_id` — reserved for the upcoming
 * GarageSnap ↔ HomeSnap object-sharing feature; always null for now).
 */

/** Category of a garage item (drives the card badge + add-form select). */
export type GarageCategory =
  | "power_tool"
  | "hand_tool"
  | "equipment"
  | "supply"
  | "other";

/**
 * Warranty state derived client-side from `warranty_expiration`:
 * "none" (no expiry), "active" (not yet expired), "expired" (past).
 */
export type WarrantyStatus = "none" | "active" | "expired";

/**
 * A tracked tool / piece of equipment in the workshop. Flat and owner-scoped
 * (clerk_user_id). `storage_location` is the room/spot it lives in — this is
 * the field the GarageSnap ↔ HomeSnap sharing maps later to HomeSnap's object
 * `room_location`. `home_object_id` is a reserved, nullable link to a HomeSnap
 * PropertyObject (null now; set by the sharing feature).
 */
export interface GarageItem {
  id: number;
  name: string;
  category: GarageCategory;
  /** Make / brand (e.g. Milwaukee), like HomeSnap's manufacturer. */
  make: string | null;
  model: string | null;
  serial_number: string | null;
  photo_url: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  warranty_expiration: string | null;
  storage_location: string | null;
  /** HomeSnap PropertyObject id this item mirrors (GarageSnap ↔ HomeSnap sharing). */
  home_object_id: number | null;
  created_at: string;
}

/**
 * The HomeSnap side of the GarageSnap ↔ HomeSnap link, resolved for a garage
 * item: the home object it mirrors, plus its property nickname and room so
 * GarageSnap can show where the same physical item lives in HomeSnap. Exposed
 * by getGarageItemHomeLink / createLinkedHomeObjectFromGarage.
 */
export interface GarageLinkedHomeObject {
  object_id: number;
  object_name: string;
  object_type: string | null;
  room_location: string | null;
  property_id: number;
  property_nickname: string;
}

/* Human labels for the enum-ish string columns (drives selects & badges). */
export const GARAGE_CATEGORY_LABELS: Record<GarageCategory, string> = {
  power_tool: "Power tool",
  hand_tool: "Hand tool",
  equipment: "Equipment",
  supply: "Supply",
  other: "Other",
};

/**
 * Resolve the warranty state for a garage item based on its warranty_expiration
 * (yyyy-mm-dd or free text) versus today. Missing/unparseable → "none".
 */
export function warrantyStatus(
  warrantyExpiration: string | null,
  today: string,
): WarrantyStatus {
  if (!warrantyExpiration) return "none";
  const t = Date.parse(`${warrantyExpiration}T00:00:00`);
  if (Number.isNaN(t)) return "none";
  const todayMs = Date.parse(`${today}T00:00:00`);
  return t >= todayMs ? "active" : "expired";
}

/** Coerce an unknown string into a known category (falling back to "other"). */
export function asGarageCategory(v: unknown): GarageCategory {
  return typeof v === "string" && v in GARAGE_CATEGORY_LABELS
    ? (v as GarageCategory)
    : "other";
}
