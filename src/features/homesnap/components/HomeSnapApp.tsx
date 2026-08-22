/**
 * HomeSnap — read/write home-record UI (phase 2 MVP).
 *
 * A self-contained module view in DocSnap's dark gray/indigo treatment:
 * auth gate, then the user's properties, the objects under a selected
 * property, and — for a selected object — its documents and timeline.
 * Every data path is owner-scoped server-side (see server.ts); this
 * component only handles presentation and form state, and renders
 * every loading/empty/error/unconfigured state honestly (no fabricated rows).
 *
 * Phase 2 adds full object CRUD (all key fields, edit, retire, delete),
 * a chronologically-grouped timeline with add/delete events, and document
 * add/remove — everything the MVP needs to be fully clickable end-to-end.
 * ReceiptSnap/GarageSnap integrations, maintenance reminders, and inventory
 * are out of scope (later phases).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearch } from "@tanstack/react-router";
import { SignInButton, useUser } from "@clerk/tanstack-start";
import {
  completeSchedule,
  createDocument,
  createEvent,
  createObject,
  createProperty,
  createSchedule,
  deleteDocument,
  deleteEvent,
  deleteObject,
  deleteSchedule,
  getHomeEntitlement,
  getHomeObjectGarageLink,
  listDocuments,
  listDueMaintenance,
  listEvents,
  listInventory,
  listObjects,
  listProperties,
  listSchedules,
  listShares,
  revokeShare,
  shareProperty,
  updateObject,
} from "../server";
import { HomeSnapActivity } from "./HomeSnapActivity";
import { HomeSnapAnalytics } from "./HomeSnapAnalytics";
import {
  DOCUMENT_TYPE_LABELS,
  EVENT_TYPE_LABELS,
  INVENTORY_CATEGORY_LABELS,
  INTERVAL_UNIT_LABELS,
  OBJECT_TYPE_LABELS,
  PROPERTY_ACCESS_LABELS,
  PROPERTY_TYPE_LABELS,
  SHARE_ROLE_LABELS,
  TASK_TYPE_LABELS,
  asDocumentType,
  asEventType,
  asIntervalUnit,
  asInventoryCategory,
  asObjectType,
  asPropertyType,
  asShareRole,
  asTaskType,
  type DocumentType,
  type EventType,
  type IntervalUnit,
  type InventoryCategory,
  type InventoryItem,
  type MaintenanceDueItem,
  type MaintenanceSchedule,
  type ObjectDocument,
  type ObjectEvent,
  type ObjectStatus,
  type ObjectType,
  type Property,
  type PropertyObject,
  type PropertyShare,
  type PropertyType,
  type ShareRole,
  type TaskType,
} from "../types";

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/** "3 months" / "1 year" / "14 days" — the human interval for a schedule. */
function intervalLabel(v: number, unit: IntervalUnit): string {
  const unitLabel = unit === "months" ? "month" : unit === "years" ? "year" : "day";
  return `${v} ${unitLabel}${v === 1 ? "" : "s"}`;
}

/** Today as yyyy-mm-dd (local), for bucketing due status client-side. */
function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Bucket a maintenance next-due date: "due" (at or before today), "soon"
 * (within the next 30 days), or "later". Falls back to "later" for unparseable
 * dates. Both buckets sort by next-due ascending.
 */
function dueBucket(nextDue: string): "due" | "soon" | "later" {
  const t = Date.parse(`${nextDue}T00:00:00`);
  if (Number.isNaN(t)) return "later";
  const diffDays = Math.floor((t - Date.parse(`${todayLocal()}T00:00:00`)) / 86400000);
  if (diffDays <= 0) return "due";
  if (diffDays <= 30) return "soon";
  return "later";
}

const TASK_BADGE: Record<TaskType, string> = {
  filter: "bg-sky-900/40 text-sky-300",
  flush: "bg-cyan-900/40 text-cyan-300",
  battery: "bg-amber-900/40 text-amber-300",
  annual: "bg-emerald-900/40 text-emerald-300",
  inspection: "bg-indigo-900/40 text-indigo-300",
  clean: "bg-violet-900/40 text-violet-300",
  other: "bg-gray-800 text-gray-300",
};

function TaskBadge({ type }: { type: TaskType }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TASK_BADGE[type]}`}>
      {TASK_TYPE_LABELS[type]}
    </span>
  );
}

function money(v: number | null): string {
  return v == null ? "" : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

function SignInRequired() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20 text-3xl">
        🏡
      </div>
      <h2 className="mt-5 text-xl font-semibold">Sign in to Open HomeSnap</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        HomeSnap keeps a permanent record of your home — its systems,
        appliances, warranties, receipts, and repair history. Your home data is
        private to your DocSnap account.
      </p>
      <SignInButton mode="modal">
        <button
          type="button"
          className="mt-6 inline-flex rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          Sign in
        </button>
      </SignInButton>
    </div>
  );
}

/**
 * Locked / upgrade screen — shown to a signed-in user WITHOUT the HomeSnap
 * add-on. HomeSnap is a paid add-on sold on the DocSnap side (business-plan
 * rev 2) and is NOT bundled into any tier, so even a paid subscriber sees this
 * until they own the add-on. The buy link is /pricing for now; the real
 * checkout link comes from the owner later (button stays inert until then).
 */
function AddonLocked() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20 text-3xl">
        🏡
      </div>
      <h2 className="mt-5 text-xl font-semibold">HomeSnap is a paid add-on</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        HomeSnap isn't included in DocSnap plans — it's a separate add-on.
        Purchase it to keep a permanent, searchable record of your home's
        systems, appliances, warranties, and repair history.
      </p>
      <Link
        to="/pricing"
        className="mt-6 inline-flex rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
      >
        See plans &amp; buy HomeSnap
      </Link>
      <p className="mt-4 text-xs text-gray-600">
        Your home records stay private to your DocSnap account.
      </p>
    </div>
  );
}

function ErrorCard({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="rounded-2xl border border-amber-900/60 bg-amber-950/30 p-5">
      <div className="flex items-start justify-between gap-4">
        <p className="text-sm leading-relaxed text-amber-200">{message}</p>
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="shrink-0 rounded-full border border-amber-700 px-3 py-1.5 text-xs font-medium text-amber-200 transition hover:bg-amber-900/40"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-800 p-8 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gray-800/60 text-2xl">
        {icon}
      </div>
      <h3 className="mt-3 text-sm font-semibold text-gray-200">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{body}</p>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-400";
const btnPrimary =
  "rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45";
const btnGhost =
  "rounded-full border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-45";

function selectOptions<T extends string>(map: Record<T, string>): T[] {
  return Object.keys(map) as T[];
}

/* ---------------------------------------------------------------- */
/* Property form                                                     */
/* ---------------------------------------------------------------- */
function PropertyForm({
  configured,
  onCreated,
  onCancel,
}: {
  configured: boolean;
  onCreated: (p: Property) => void;
  onCancel?: () => void;
}) {
  const [nickname, setNickname] = useState("");
  const [propertyType, setPropertyType] = useState<PropertyType>("house");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { property } = await createProperty({
        data: {
          nickname,
          property_type: propertyType,
          purchase_date: purchaseDate || null,
          purchase_price: purchasePrice || null,
        },
      });
      setNickname("");
      setPurchaseDate("");
      setPurchasePrice("");
      onCreated(property as Property);
    } catch (err) {
      setError(messageFromError(err, "The property could not be created."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div>
        <label className={labelCls} htmlFor="hs-prop-nickname">
          Nickname
        </label>
        <input
          id="hs-prop-nickname"
          className={inputCls}
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
          placeholder="Maple St House"
          required
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="hs-prop-type">
            Type
          </label>
          <select
            id="hs-prop-type"
            className={inputCls}
            value={propertyType}
            onChange={(e) => setPropertyType(asPropertyType(e.target.value))}
          >
            {selectOptions<PropertyType>(PROPERTY_TYPE_LABELS).map((t) => (
              <option key={t} value={t}>
                {PROPERTY_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-prop-date">
            Purchase date
          </label>
          <input
            id="hs-prop-date"
            type="date"
            className={inputCls}
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
          />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-prop-price">
            Price
          </label>
          <input
            id="hs-prop-price"
            className={inputCls}
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
            placeholder="e.g. 425000"
            inputMode="decimal"
          />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !configured} className={btnPrimary}>
          {busy ? "Saving…" : "Add property"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-500 transition hover:text-gray-300">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- */
/* Object form (create + edit)                                       */
/* ---------------------------------------------------------------- */
function ObjectForm({
  configured,
  propertyId,
  initial,
  onSaved,
  onCancel,
}: {
  configured: boolean;
  propertyId: number;
  initial?: PropertyObject | null;
  onSaved: (o: PropertyObject) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [objectType, setObjectType] = useState<ObjectType>(initial?.object_type ?? "system");
  const [manufacturer, setManufacturer] = useState(initial?.manufacturer ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [serial, setSerial] = useState(initial?.serial_number ?? "");
  const [room, setRoom] = useState(initial?.room_location ?? "");
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchase_date ?? "");
  const [installDate, setInstallDate] = useState(initial?.installation_date ?? "");
  const [price, setPrice] = useState(initial?.purchase_price != null ? String(initial.purchase_price) : "");
  const [warranty, setWarranty] = useState(initial?.warranty_expiration ?? "");
  const [status, setStatus] = useState<ObjectStatus>(initial?.status ?? "active");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const payload = {
      object_type: objectType,
      name,
      manufacturer: manufacturer || null,
      model: model || null,
      serial_number: serial || null,
      room_location: room || null,
      purchase_date: purchaseDate || null,
      installation_date: installDate || null,
      purchase_price: price || null,
      warranty_expiration: warranty || null,
      status,
      notes: notes || null,
    };
    try {
      if (initial) {
        const { object } = await updateObject({ data: { id: initial.id, ...payload } });
        onSaved(object as PropertyObject);
      } else {
        const { object } = await createObject({ data: { property_id: propertyId, ...payload } });
        onSaved(object as PropertyObject);
      }
    } catch (err) {
      setError(messageFromError(err, "The object could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="hs-obj-name">Name</label>
          <input id="hs-obj-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Main HVAC" required />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-obj-type">Type</label>
          <select id="hs-obj-type" className={inputCls} value={objectType} onChange={(e) => setObjectType(asObjectType(e.target.value))}>
            {selectOptions<ObjectType>(OBJECT_TYPE_LABELS).map((t) => (
              <option key={t} value={t}>{OBJECT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-obj-mfg">Manufacturer</label>
          <input id="hs-obj-mfg" className={inputCls} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Trane" />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-obj-model">Model</label>
          <input id="hs-obj-model" className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} placeholder="XR16" />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-obj-serial">Serial #</label>
          <input id="hs-obj-serial" className={inputCls} value={serial} onChange={(e) => setSerial(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-obj-room">Location</label>
          <input id="hs-obj-room" className={inputCls} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Basement" />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-obj-purchase">Purchase date</label>
          <input id="hs-obj-purchase" type="date" className={inputCls} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-obj-install">Installation date</label>
          <input id="hs-obj-install" type="date" className={inputCls} value={installDate} onChange={(e) => setInstallDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-obj-price">Price</label>
          <input id="hs-obj-price" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 3200" inputMode="decimal" />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-obj-warranty">Warranty expiration</label>
          <input id="hs-obj-warranty" type="date" className={inputCls} value={warranty} onChange={(e) => setWarranty(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-obj-status">Status</label>
          <select id="hs-obj-status" className={inputCls} value={status} onChange={(e) => setStatus(e.target.value === "retired" ? "retired" : "active")}>
            <option value="active">Active</option>
            <option value="retired">Retired</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="hs-obj-notes">Notes</label>
          <textarea id="hs-obj-notes" rows={2} className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Any details worth remembering" />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !configured} className={btnPrimary}>
          {busy ? "Saving…" : initial ? "Save changes" : "Add object"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-500 transition hover:text-gray-300">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

/* ---------------------------------------------------------------- */
/* Timeline + documents forms (attached to a selected object)         */
/* ---------------------------------------------------------------- */
function EventForm({
  configured,
  objectId,
  onCreated,
}: {
  configured: boolean;
  objectId: number;
  onCreated: (ev: ObjectEvent) => void;
}) {
  const [eventType, setEventType] = useState<EventType>("serviced");
  const [occurredOn, setOccurredOn] = useState("");
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [cost, setCost] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { event } = await createEvent({
        data: {
          object_id: objectId,
          event_type: eventType,
          occurred_on: occurredOn || null,
          title: title || null,
          notes: notes || null,
          cost: cost === "" ? null : Number(cost),
        },
      });
      setTitle("");
      setNotes("");
      setOccurredOn("");
      setCost("");
      onCreated(event as ObjectEvent);
    } catch (err) {
      setError(messageFromError(err, "The event could not be added."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className={labelCls} htmlFor="hs-ev-type">Type</label>
          <select id="hs-ev-type" className={inputCls} value={eventType} onChange={(e) => setEventType(asEventType(e.target.value))}>
            {selectOptions<EventType>(EVENT_TYPE_LABELS).map((t) => (
              <option key={t} value={t}>{EVENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-ev-date">Date</label>
          <input id="hs-ev-date" type="date" className={inputCls} value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-ev-title">Title</label>
          <input id="hs-ev-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Annual service" />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-ev-cost">Cost ($)</label>
          <input id="hs-ev-cost" type="number" min="0" step="0.01" className={inputCls} value={cost} onChange={(e) => setCost(e.target.value)} placeholder="e.g. 250" />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="hs-ev-notes">Notes</label>
        <input id="hs-ev-notes" className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Replaced air filter, cleaned coils" />
      </div>
      <p className="text-xs text-gray-500">
        Tip: enter a cost for repair/service work so it's counted in your spend analytics.
      </p>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy || !configured} className={btnPrimary}>
        {busy ? "Adding…" : "Add to timeline"}
      </button>
    </form>
  );
}

function DocumentForm({
  configured,
  objectId,
  onCreated,
}: {
  configured: boolean;
  objectId: number;
  onCreated: (d: ObjectDocument) => void;
}) {
  const [title, setTitle] = useState("");
  const [documentType, setDocumentType] = useState<DocumentType>("receipt");
  const [fileUrl, setFileUrl] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { document } = await createDocument({
        data: {
          object_id: objectId,
          document_type: documentType,
          title: title || null,
          file_url: fileUrl,
          notes: notes || null,
        },
      });
      setTitle("");
      setFileUrl("");
      setNotes("");
      onCreated(document as ObjectDocument);
    } catch (err) {
      setError(messageFromError(err, "The document could not be added."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls} htmlFor="hs-doc-type">Type</label>
          <select id="hs-doc-type" className={inputCls} value={documentType} onChange={(e) => setDocumentType(asDocumentType(e.target.value))}>
            {selectOptions<DocumentType>(DOCUMENT_TYPE_LABELS).map((t) => (
              <option key={t} value={t}>{DOCUMENT_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-doc-title">Title</label>
          <input id="hs-doc-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="HVAC receipt" />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-doc-url">Link / URL</label>
          <input id="hs-doc-url" type="url" className={inputCls} value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" required />
        </div>
      </div>
      <div>
        <label className={labelCls} htmlFor="hs-doc-notes">Notes</label>
        <input id="hs-doc-notes" className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. paid in full — keep for warranty" />
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy || !configured} className={btnPrimary}>
        {busy ? "Adding…" : "Attach document"}
      </button>
    </form>
  );
}

/* ---------------------------------------------------------------- */
/* Maintenance schedule form (attach a recurring task to an object)   */
/* ---------------------------------------------------------------- */
function MaintenanceForm({
  configured,
  objectId,
  onCreated,
}: {
  configured: boolean;
  objectId: number;
  onCreated: (s: MaintenanceSchedule) => void;
}) {
  const [taskType, setTaskType] = useState<TaskType>("filter");
  const [title, setTitle] = useState("");
  const [intervalValue, setIntervalValue] = useState("3");
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>("months");
  const [nextDue, setNextDue] = useState("");
  const [lastDone, setLastDone] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { schedule } = await createSchedule({
        data: {
          object_id: objectId,
          task_type: taskType,
          title: title || null,
          interval_value: Number(intervalValue),
          interval_unit: intervalUnit,
          next_due: nextDue,
          last_done: lastDone || null,
          notes: notes || null,
        },
      });
      setTitle("");
      setNextDue("");
      setLastDone("");
      setNotes("");
      onCreated(schedule as MaintenanceSchedule);
    } catch (err) {
      setError(messageFromError(err, "The maintenance task could not be added."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="hs-ms-type">Task</label>
          <select id="hs-ms-type" className={inputCls} value={taskType} onChange={(e) => setTaskType(asTaskType(e.target.value))}>
            {selectOptions<TaskType>(TASK_TYPE_LABELS).map((t) => (
              <option key={t} value={t}>{TASK_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-ms-title">Title</label>
          <input id="hs-ms-title" className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Replace air filter" />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-ms-interval-val">Every</label>
          <input id="hs-ms-interval-val" className={inputCls} value={intervalValue} onChange={(e) => setIntervalValue(e.target.value)} inputMode="numeric" placeholder="3" required />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-ms-interval-unit">Unit</label>
          <select id="hs-ms-interval-unit" className={inputCls} value={intervalUnit} onChange={(e) => setIntervalUnit(asIntervalUnit(e.target.value))}>
            {selectOptions<IntervalUnit>(INTERVAL_UNIT_LABELS).map((u) => (
              <option key={u} value={u}>{INTERVAL_UNIT_LABELS[u]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-ms-next-due">Next due</label>
          <input id="hs-ms-next-due" type="date" className={inputCls} value={nextDue} onChange={(e) => setNextDue(e.target.value)} required />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-ms-last-done">Last done (optional)</label>
          <input id="hs-ms-last-done" type="date" className={inputCls} value={lastDone} onChange={(e) => setLastDone(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="hs-ms-notes">Notes</label>
          <input id="hs-ms-notes" className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. MERV-13 pleated filters" />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button type="submit" disabled={busy || !configured} className={btnPrimary}>
        {busy ? "Adding…" : "Add maintenance task"}
      </button>
    </form>
  );
}

/* ---------------------------------------------------------------- */
/* Maintenance section (attached to a selected object)                */
/* ---------------------------------------------------------------- */
function MaintenanceSection({
  configured,
  objectId,
  onChanged,
}: {
  configured: boolean;
  objectId: number;
  onChanged: () => void;
}) {
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await listSchedules({ data: { object_id: objectId } });
      setSchedules((res.schedules as MaintenanceSchedule[]) ?? []);
      setStatus("ready");
      setLoadError("");
    } catch (err) {
      setStatus("error");
      setLoadError(messageFromError(err, "The maintenance schedule could not be loaded."));
    }
  }, [objectId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function markDone(s: MaintenanceSchedule) {
    try {
      await completeSchedule({ data: { id: s.id } });
      await load();
      onChanged();
    } catch (err) {
      window.alert(messageFromError(err, "The task could not be marked done."));
    }
  }

  async function remove(s: MaintenanceSchedule) {
    if (!window.confirm(`Remove "${s.title ?? TASK_TYPE_LABELS[s.task_type]}" from the schedule?`)) return;
    try {
      await deleteSchedule({ data: { id: s.id } });
      setSchedules((prev) => prev.filter((x) => x.id !== s.id));
      onChanged();
    } catch (err) {
      window.alert(messageFromError(err, "The task could not be removed."));
    }
  }

  const sorted = useMemo(
    () => [...schedules].sort((a, b) => a.next_due.localeCompare(b.next_due)),
    [schedules],
  );

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">Maintenance schedule</h4>
        <span className="text-xs text-gray-500">{sorted.length} task{sorted.length === 1 ? "" : "s"}</span>
      </div>
      <p className="mt-1 text-sm text-gray-500">
        Recurring upkeep — filter changes, flushes, battery swaps, annual service. Mark a task
        done to roll its next due date forward by the interval.
      </p>

      <div className="mt-4 space-y-2">
        {status === "loading" ? (
          <div className="h-14 animate-pulse rounded-xl border border-gray-800 bg-gray-800/40" aria-label="Loading maintenance" />
        ) : status === "error" ? (
          <ErrorCard message={loadError} onRetry={() => void load()} />
        ) : sorted.length ? (
          sorted.map((s) => {
            const b = dueBucket(s.next_due);
            return (
              <div key={s.id} className="group flex gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3">
                <TaskBadge type={s.task_type} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-sm font-medium text-gray-200">
                      {s.title ?? TASK_TYPE_LABELS[s.task_type]}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                      b === "due"
                        ? "bg-red-900/40 text-red-300"
                        : b === "soon"
                          ? "bg-amber-900/40 text-amber-300"
                          : "bg-gray-800 text-gray-400"
                    }`}>
                      {b === "due" ? "Due" : b === "soon" ? "Coming up" : "Scheduled"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-xs text-gray-500">
                    every {intervalLabel(s.interval_value, s.interval_unit)}
                    {s.last_done ? ` · last done ${s.last_done}` : ""}
                  </p>
                  {s.notes && <p className="mt-0.5 text-xs text-gray-500">{s.notes}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-end justify-between gap-1">
                  <span className="text-xs font-medium text-gray-300">Due {s.next_due}</span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void markDone(s)}
                      className="rounded-md bg-emerald-900/40 px-2.5 py-1 text-xs font-medium text-emerald-300 transition hover:bg-emerald-800/40"
                    >
                      Mark done
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(s)}
                      aria-label={`Remove ${(s.title ?? "task")}`}
                      className="rounded-md px-2 py-1 text-xs text-gray-600 transition hover:bg-red-900/30 hover:text-red-300"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <EmptyState
            icon="🔁"
            title="No maintenance tasks yet"
            body={
              configured
                ? "Add recurring upkeep so HomeSnap can remind you when it's due."
                : "Maintenance tasks will appear here once storage is connected."
            }
          />
        )}
      </div>

      <details className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-3">
        <summary className="cursor-pointer text-sm font-medium text-indigo-300">
          Add a maintenance task
        </summary>
        <MaintenanceForm
          configured={configured}
          objectId={objectId}
          onCreated={(s) => {
            setSchedules((prev) => [...prev, s]);
            onChanged();
          }}
        />
      </details>
    </section>
  );
}

const EVENT_BADGE: Record<EventType, string> = {
  installed: "bg-emerald-900/40 text-emerald-300",
  serviced: "bg-sky-900/40 text-sky-300",
  repaired: "bg-amber-900/40 text-amber-300",
  other: "bg-indigo-900/40 text-indigo-300",
};

/* ---------------------------------------------------------------- */
/* GarageSnap ↔ HomeSnap sharing (HomeSnap read side)                */
/* ---------------------------------------------------------------- */
/**
 * Read-only, navigational card shown on a home object when it's linked to a
 * GarageSnap item: surfaces that the same physical item is also tracked in
 * GarageSnap and where it's stored. The reverse (linking) is done from the
 * GarageSnap side; here we only read and display, so no write actions exist.
 */
function GarageObjectLinkCard({ object }: { object: PropertyObject }) {
  const [link, setLink] = useState<{
    item_id: number;
    item_name: string;
    storage_location: string | null;
  } | null>(null);
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setChecked(false);
    setLink(null);
    setError("");
    getHomeObjectGarageLink({ data: { object_id: object.id } })
      .then((res) => {
        if (cancelled) return;
        setLink(
          res.linked
            ? ((res.link as unknown) as {
                item_id: number;
                item_name: string;
                storage_location: string | null;
              })
            : null,
        );
        setChecked(true);
      })
      .catch((err) => {
        if (cancelled) return;
        setChecked(true);
        setError(messageFromError(err, "The GarageSnap link couldn't be loaded."));
      });
    return () => {
      cancelled = true;
    };
  }, [object.id]);

  if (error) return null; // non-fatal — never block the object view on this
  return (
    <section className="rounded-2xl border border-indigo-900/40 bg-indigo-950/20 p-5">
      <div className="flex items-center justify-between">
        <h4 className="font-semibold">GarageSnap</h4>
        {checked && link && <span className="text-xs text-gray-400">shared object</span>}
      </div>
      {!checked ? (
        <div className="mt-3 h-4 animate-pulse rounded bg-gray-800" aria-label="Loading GarageSnap link" />
      ) : link ? (
        <div className="mt-3">
          <p className="text-sm font-medium text-indigo-200">🔧 Also tracked in GarageSnap</p>
          <p className="mt-1 text-sm text-gray-300">{link.item_name}</p>
          <p className="mt-0.5 text-xs text-gray-500">
            {link.storage_location
              ? `Stored at ${link.storage_location}`
              : "Storage location not recorded"}
          </p>
        </div>
      ) : (
        <p className="mt-3 text-sm text-gray-500">Not linked to a GarageSnap item.</p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Object detail: timeline + documents                               */
/* ---------------------------------------------------------------- */
function ObjectDetail({
  configured,
  object,
  onMaintenanceChanged,
}: {
  configured: boolean;
  object: PropertyObject;
  onMaintenanceChanged?: () => void;
}) {
  const [events, setEvents] = useState<ObjectEvent[]>([]);
  const [documents, setDocuments] = useState<ObjectDocument[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(
    async (obj: PropertyObject) => {
      setStatus("loading");
      try {
        const [evRes, docRes] = await Promise.all([
          listEvents({ data: { object_id: obj.id } }),
          listDocuments({ data: { object_id: obj.id } }),
        ]);
        setEvents((evRes.events as ObjectEvent[]) ?? []);
        setDocuments((docRes.documents as ObjectDocument[]) ?? []);
        setStatus("ready");
        setLoadError("");
      } catch (err) {
        setStatus("error");
        setLoadError(messageFromError(err, "The object's history could not be loaded."));
      }
    },
    [],
  );

  useEffect(() => {
    void load(object);
  }, [object, load]);

  // Chronological by occurred_on (fall back to created_at), oldest first.
  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) =>
        (a.occurred_on ?? a.created_at).localeCompare(b.occurred_on ?? b.created_at),
      ),
    [events],
  );

  // Group by date for visual scanning.
  const groups = useMemo(() => {
    const map = new Map<string, ObjectEvent[]>();
    for (const ev of sortedEvents) {
      const date = (ev.occurred_on ?? ev.created_at ?? "").slice(0, 10);
      const key = date || "No date";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return Array.from(map.entries());
  }, [sortedEvents]);

  async function removeEvent(ev: ObjectEvent) {
    if (!window.confirm("Delete this timeline entry?")) return;
    try {
      await deleteEvent({ data: { id: ev.id } });
      setEvents((prev) => prev.filter((e) => e.id !== ev.id));
    } catch (err) {
      window.alert(messageFromError(err, "The entry could not be deleted."));
    }
  }

  async function removeDocument(doc: ObjectDocument) {
    if (!window.confirm("Remove this document from the object?")) return;
    try {
      await deleteDocument({ data: { id: doc.id } });
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      window.alert(messageFromError(err, "The document could not be removed."));
    }
  }

  const warranty = object.warranty_expiration
    ? ` · Warranty until ${object.warranty_expiration}`
    : "";
  const purchase = object.purchase_price != null
    ? ` · $${object.purchase_price.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
    : "";
  const meta = [object.manufacturer, object.model, object.room_location]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-lg font-semibold">{object.name}</h3>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              object.status === "retired"
                ? "bg-gray-800 text-gray-400"
                : "bg-emerald-900/40 text-emerald-300"
            }`}
          >
            {object.status === "retired" ? "Retired" : "Active"}
          </span>
        </div>
        <p className="mt-1 text-sm text-gray-400">
          {OBJECT_TYPE_LABELS[object.object_type]}
          {meta ? ` · ${meta}` : ""}
          {warranty}
          {purchase}
        </p>
        {((object.serial_number) || (object.purchase_date) || (object.installation_date)) && (
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-gray-500">
            {object.serial_number && <span>Serial: {object.serial_number}</span>}
            {object.purchase_date && <span>Bought {object.purchase_date}</span>}
            {object.installation_date && <span>Installed {object.installation_date}</span>}
          </p>
        )}
        {object.notes && <p className="mt-2 text-sm text-gray-300">{object.notes}</p>}
      </div>

      {/* GarageSnap ↔ HomeSnap shared-context (read-only) */}
      <GarageObjectLinkCard object={object} />

      {status === "error" && <ErrorCard message={loadError} onRetry={() => void load(object)} />}

      {/* Timeline */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Timeline</h4>
          <span className="text-xs text-gray-500">{sortedEvents.length} entries</span>
        </div>

        <div className="mt-4 space-y-4">
          {status === "loading" ? (
            <div className="h-20 animate-pulse rounded-xl border border-gray-800 bg-gray-800/40" aria-label="Loading timeline" />
          ) : groups.length ? (
            groups.map(([date, items]) => (
              <div key={date}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">{date}</p>
                <div className="space-y-2">
                  {items.map((ev) => (
                    <div key={ev.id} className="group flex gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3">
                      <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${EVENT_BADGE[ev.event_type]}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${EVENT_BADGE[ev.event_type]}`}>
                            {EVENT_TYPE_LABELS[ev.event_type]}
                          </span>
                          <span className="text-sm font-medium text-gray-200">
                            {ev.title ?? "Untitled event"}
                          </span>
                          {ev.cost != null && ev.cost > 0 && (
                            <span className="rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs font-semibold text-emerald-300">
                              {money(ev.cost)}
                            </span>
                          )}
                        </div>
                        {ev.notes && <p className="mt-1 text-sm text-gray-400">{ev.notes}</p>}
                      </div>
                      <button
                        type="button"
                        onClick={() => void removeEvent(ev)}
                        aria-label={`Delete ${(ev.title ?? "event")}`}
                        className="self-start rounded-md px-2 py-1 text-xs text-gray-600 transition hover:bg-red-900/30 hover:text-red-300"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          ) : (
            <EmptyState
              icon="🗓️"
              title="No timeline entries yet"
              body={
                configured
                  ? "Add the story of this object — when it was installed, serviced, or repaired."
                  : "Timeline entries will appear here once storage is connected."
              }
            />
          )}
        </div>

        <details className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-3">
          <summary className="cursor-pointer text-sm font-medium text-indigo-300">
            Add a timeline entry
          </summary>
          <EventForm
            configured={configured}
            objectId={object.id}
            onCreated={(ev) => setEvents((prev) => [...prev, ev])}
          />
        </details>
      </section>

      {/* Documents */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold">Documents</h4>
          <span className="text-xs text-gray-500">{documents.length} attached</span>
        </div>

        <div className="mt-4 space-y-2">
          {status === "loading" ? (
            <div className="h-14 animate-pulse rounded-xl border border-gray-800 bg-gray-800/40" aria-label="Loading documents" />
          ) : documents.length ? (
            documents.map((doc) => (
              <div key={doc.id} className="group flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3">
                <span className="shrink-0 rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-300">
                  {DOCUMENT_TYPE_LABELS[doc.document_type]}
                </span>
                <div className="min-w-0 flex-1">
                  <a
                    href={doc.file_url}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-sm font-medium text-indigo-300 transition hover:text-indigo-200"
                  >
                    {doc.title ?? doc.file_url}
                  </a>
                  {doc.notes && <p className="truncate text-xs text-gray-500">{doc.notes}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => void removeDocument(doc)}
                  aria-label={`Remove ${(doc.title ?? "document")}`}
                  className="shrink-0 rounded-md px-2 py-1 text-xs text-gray-600 transition hover:bg-red-900/30 hover:text-red-300"
                >
                  Remove
                </button>
              </div>
            ))
          ) : (
            <EmptyState
              icon="📎"
              title="No documents attached"
              body={
                configured
                  ? "Attach receipts, manuals, warranties, and photos so they live with this object."
                  : "Documents will appear here once storage is connected."
              }
            />
          )}
        </div>

        <details className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-3">
          <summary className="cursor-pointer text-sm font-medium text-indigo-300">
            Attach a document
          </summary>
          <DocumentForm
            configured={configured}
            objectId={object.id}
            onCreated={(d) => setDocuments((prev) => [...prev, d])}
          />
        </details>
      </section>

      {/* Maintenance schedule */}
      <MaintenanceSection
        configured={configured}
        objectId={object.id}
        onChanged={onMaintenanceChanged}
      />
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Object card + management                                          */
/* ---------------------------------------------------------------- */
function ObjectCard({
  object,
  selected,
  onSelect,
  onEdit,
  onToggleStatus,
  onDelete,
  canEdit = true,
}: {
  object: PropertyObject;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
  /** false for read-only ('view') grantee — hides edit/retire/delete. */
  canEdit?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 transition ${
        selected ? "border-indigo-600 bg-indigo-950/30" : "border-gray-800 bg-gray-950/40 hover:border-gray-700"
      }`}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <span className="block truncate text-sm font-medium text-gray-100">{object.name}</span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
          <span
            className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
              object.status === "retired"
                ? "bg-gray-800 text-gray-400"
                : "bg-emerald-900/40 text-emerald-300"
            }`}
          >
            {object.status === "retired" ? "Retired" : "Active"}
          </span>
          {OBJECT_TYPE_LABELS[object.object_type]}
          {object.room_location ? ` · ${object.room_location}` : ""}
        </span>
      </button>
      {canEdit && (
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-md bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-200 transition hover:bg-gray-700"
          >
            Edit
          </button>
          <button
            type="button"
            onClick={onToggleStatus}
            className="rounded-md bg-gray-800 px-2.5 py-1 text-xs font-medium text-gray-200 transition hover:bg-gray-700"
          >
            {object.status === "retired" ? "Activate" : "Retire"}
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="ml-auto rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 transition hover:bg-red-900/30 hover:text-red-300"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Maintenance due / Coming up (HomeSnap home view)                   */
/* ---------------------------------------------------------------- */
function DueMaintenance({
  items,
  onSelect,
}: {
  items: MaintenanceDueItem[];
  onSelect: (item: MaintenanceDueItem) => void;
}) {
  const due = items.filter((i) => dueBucket(i.next_due) === "due");
  const soon = items.filter((i) => dueBucket(i.next_due) === "soon");
  const rest = items.filter((i) => dueBucket(i.next_due) === "later");

  function Row({ item, bucket }: { item: MaintenanceDueItem; bucket: "due" | "soon" | "later" }) {
    const badgeCls =
      bucket === "due"
        ? "bg-red-900/40 text-red-300"
        : bucket === "soon"
          ? "bg-amber-900/40 text-amber-300"
          : "bg-gray-800 text-gray-400";
    return (
      <button
        type="button"
        onClick={() => onSelect(item)}
        className="flex w-full items-center justify-between gap-3 rounded-xl border border-gray-800 bg-gray-950/40 px-4 py-3 text-left transition hover:border-gray-700"
      >
        <span className="min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${badgeCls}`}>
              {bucket === "due" ? "Due" : bucket === "soon" ? "Coming up" : "Scheduled"}
            </span>
            <span className="block truncate text-sm font-medium text-gray-100">
              {item.title ?? TASK_TYPE_LABELS[item.task_type]}
            </span>
            <span className="hidden text-xs text-gray-500 sm:inline">· {item.object_name}</span>
          </span>
          <span className="mt-0.5 block text-xs text-gray-500">
            {item.property_nickname}
            {item.object_name ? ` · ${item.object_name}` : ""} · every{" "}
            {intervalLabel(item.interval_value, item.interval_unit)}
            {item.last_done ? ` · last done ${item.last_done}` : ""}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-indigo-300">{item.next_due}</span>
      </button>
    );
  }

  function Bucket({ label, list }: { label: string; list: MaintenanceDueItem[] }) {
    if (!list.length) return null;
    return (
      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
          {label} · {list.length}
        </p>
        <div className="space-y-2">
          {list.map((item) => (
            <Row key={item.id} item={item} bucket={dueBucket(item.next_due)} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
      <div>
        <h2 className="font-semibold">Maintenance</h2>
        <p className="mt-1 text-sm text-gray-500">
          What's due and coming up across your homes, sorted by next due date.
        </p>
      </div>
      <div className="mt-4 space-y-5">
        <Bucket label="Due" list={due} />
        <Bucket label="Coming up" list={soon} />
        <Bucket label="Later" list={rest} />
        {!items.length && (
          <EmptyState
            icon="📅"
            title="No maintenance scheduled"
            body="Open an object and add a maintenance task — HomeSnap will surface it here when it's due."
          />
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Inventory (cross-home big-ticket possessions)                     */
/* ---------------------------------------------------------------- */
function InventoryAddForm({
  configured,
  properties,
  defaultPropertyId,
  onCreated,
  onCancel,
}: {
  configured: boolean;
  properties: Property[];
  defaultPropertyId: number | null;
  onCreated: (item: InventoryItem) => void;
  onCancel?: () => void;
}) {
  const [propertyId, setPropertyId] = useState<number>(
    defaultPropertyId ?? properties[0]?.id ?? 0,
  );
  const [category, setCategory] = useState<InventoryCategory>("electronics");
  const [name, setName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [room, setRoom] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [price, setPrice] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [receiptUrl, setReceiptUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!propertyId) {
      setError("Add a property first — inventory items live in a home.");
      return;
    }
    setBusy(true);
    try {
      const { object } = await createObject({
        data: {
          property_id: propertyId,
          object_type: "inventory",
          name,
          manufacturer: manufacturer || null,
          model: model || null,
          serial_number: serial || null,
          room_location: room || null,
          purchase_date: purchaseDate || null,
          purchase_price: price || null,
          status: "active",
          inventory_category: category,
        },
      });
      const obj = object as PropertyObject;
      // Attach the photo and/or receipt via the existing document mechanism so
      // they stay tied to this item (same rows the object detail shows).
      if (photoUrl.trim()) {
        await createDocument({
          data: {
            object_id: obj.id,
            document_type: "photo",
            title: `${obj.name} photo`,
            file_url: photoUrl.trim(),
          },
        });
      }
      if (receiptUrl.trim()) {
        await createDocument({
          data: {
            object_id: obj.id,
            document_type: "receipt",
            title: `${obj.name} receipt`,
            file_url: receiptUrl.trim(),
          },
        });
      }
      const nickname = properties.find((p) => p.id === propertyId)?.nickname ?? "";
      const item: InventoryItem = {
        ...obj,
        property_nickname: nickname,
        photo_url: photoUrl.trim() || null,
      };
      setName("");
      setManufacturer("");
      setModel("");
      setSerial("");
      setRoom("");
      setPurchaseDate("");
      setPrice("");
      setPhotoUrl("");
      setReceiptUrl("");
      onCreated(item);
    } catch (err) {
      setError(messageFromError(err, "The inventory item could not be added."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="hs-inv-name">Item name</label>
          <input id="hs-inv-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder='Sony 65" OLED TV' required />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-inv-category">Category</label>
          <select id="hs-inv-category" className={inputCls} value={category} onChange={(e) => setCategory(asInventoryCategory(e.target.value))}>
            {selectOptions<InventoryCategory>(INVENTORY_CATEGORY_LABELS).map((c) => (
              <option key={c} value={c}>{INVENTORY_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-inv-mfg">Manufacturer</label>
          <input id="hs-inv-mfg" className={inputCls} value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Sony" />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-inv-model">Model</label>
          <input id="hs-inv-model" className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} placeholder="XR-65X90L" />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-inv-serial">Serial #</label>
          <input id="hs-inv-serial" className={inputCls} value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Insurance-grade serial" />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-inv-room">Location</label>
          <input id="hs-inv-room" className={inputCls} value={room} onChange={(e) => setRoom(e.target.value)} placeholder="Living room" />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-inv-date">Purchase date</label>
          <input id="hs-inv-date" type="date" className={inputCls} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-inv-price">Value ($)</label>
          <input id="hs-inv-price" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 1999" inputMode="decimal" />
        </div>
        <div>
          <label className={labelCls} htmlFor="hs-inv-prop">Home</label>
          <select id="hs-inv-prop" className={inputCls} value={propertyId} onChange={(e) => setPropertyId(Number(e.target.value))} disabled={!properties.length}>
            {properties.length ? (
              properties.map((p) => <option key={p.id} value={p.id}>{p.nickname}</option>)
            ) : (
              <option value={0}>No property yet</option>
            )}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="hs-inv-photo">Photo link (optional)</label>
          <input id="hs-inv-photo" type="url" className={inputCls} value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://… item photo" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="hs-inv-receipt">Receipt link (optional)</label>
          <input id="hs-inv-receipt" type="url" className={inputCls} value={receiptUrl} onChange={(e) => setReceiptUrl(e.target.value)} placeholder="https://… receipt" />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !configured} className={btnPrimary}>
          {busy ? "Saving…" : "Add inventory item"}
        </button>
        {onCancel && (
          <button type="button" onClick={onCancel} className="text-sm text-gray-500 transition hover:text-gray-300">
            Cancel
          </button>
        )}
      </div>
    </form>
  );
}

function InventoryView({
  configured,
  properties,
  defaultPropertyId,
  onSelect,
}: {
  configured: boolean;
  properties: Property[];
  defaultPropertyId: number | null;
  onSelect: (item: InventoryItem) => void;
}) {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<InventoryCategory | "all">("all");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await listInventory();
      setItems((res.items as InventoryItem[]) ?? []);
      setStatus("ready");
      setLoadError("");
    } catch (err) {
      setStatus("error");
      setLoadError(messageFromError(err, "Your inventory could not be loaded."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (categoryFilter !== "all" && i.inventory_category !== categoryFilter) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.manufacturer ?? "").toLowerCase().includes(q) ||
        (i.serial_number ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, categoryFilter]);

  const totalValue = useMemo(
    () => items.reduce((sum, i) => sum + (i.purchase_price ?? 0), 0),
    [items],
  );

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Home inventory</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            The significant possessions in your home — TVs, computers, furniture,
            tools, electronics, jewelry — with photos, serial numbers, and
            receipts for insurance and sale records.
          </p>
        </div>
        {!showForm && (
          <button type="button" onClick={() => setShowForm(true)} className={btnGhost}>
            + Add inventory item
          </button>
        )}
      </div>

      {status === "error" && <div className="mt-4"><ErrorCard message={loadError} onRetry={() => void load()} /></div>}

      {showForm && (
        <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-200">New inventory item</h3>
            <button type="button" onClick={() => setShowForm(false)} className="text-xs text-gray-500 transition hover:text-gray-300">
              Close
            </button>
          </div>
          <InventoryAddForm
            configured={configured}
            properties={properties}
            defaultPropertyId={defaultPropertyId}
            onCancel={() => setShowForm(false)}
            onCreated={(item) => {
              setItems((prev) => [item, ...prev]);
              setShowForm(false);
            }}
          />
        </div>
      )}

      {status === "ready" && (items.length > 0 || query || categoryFilter !== "all") && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            className={inputCls}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, manufacturer, or serial…"
          />
          <select
            className={`${inputCls} sm:w-48`}
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value === "all" ? "all" : asInventoryCategory(e.target.value))}
          >
            <option value="all">All categories</option>
            {selectOptions<InventoryCategory>(INVENTORY_CATEGORY_LABELS).map((c) => (
              <option key={c} value={c}>{INVENTORY_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
      )}

      {status === "loading" ? (
        <div className="mt-4 h-24 animate-pulse rounded-xl border border-gray-800 bg-gray-800/40" aria-label="Loading inventory" />
      ) : status === "ready" && filtered.length ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSelect(item)}
              className="flex overflow-hidden rounded-xl border border-gray-800 bg-gray-950/40 text-left transition hover:border-gray-700"
            >
              {item.photo_url ? (
                <img src={item.photo_url} alt={item.name} className="h-24 w-24 shrink-0 object-cover" />
              ) : (
                <div className="grid h-24 w-24 shrink-0 place-items-center bg-gray-800/60 text-2xl">📷</div>
              )}
              <div className="min-w-0 flex-1 p-3">
                <span className="block truncate text-sm font-medium text-gray-100">{item.name}</span>
                <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-gray-500">
                  <span className="rounded-full bg-indigo-900/40 px-2 py-0.5 text-[10px] font-medium text-indigo-300">
                    {item.inventory_category
                      ? INVENTORY_CATEGORY_LABELS[asInventoryCategory(item.inventory_category)]
                      : "Inventory"}
                  </span>
                  {item.property_nickname && <span>{item.property_nickname}</span>}
                </span>
                {item.serial_number && (
                  <span className="mt-1 block truncate text-xs text-gray-500">S/N {item.serial_number}</span>
                )}
                <span className="mt-1 block text-sm font-semibold text-emerald-300">
                  {money(item.purchase_price)}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : status === "ready" ? (
        <div className="mt-4">
          <EmptyState
            icon="📦"
            title={items.length ? "Nothing matches your search" : "No inventory items yet"}
            body={
              items.length
                ? "Try a different category or search term."
                : configured
                  ? "Add the big-ticket things in your home — each with its photo, serial, value, and receipt."
                  : "Inventory items will appear here once storage is connected."
            }
          />
        </div>
      ) : null}

      {status === "ready" && items.length > 0 && (
        <p className="mt-4 text-xs text-gray-500">
          {items.length} {items.length === 1 ? "item" : "items"} · total recorded value{" "}
          <span className="font-semibold text-gray-300">{money(totalValue)}</span>
        </p>
      )}
    </section>
  );
}

/* ---------------------------------------------------------------- */
/* Sharing / household access                                        */
/* ---------------------------------------------------------------- */
/**
 * Owner-only panel to manage who can view/edit a property. Lists current
 * grants (email + role), adds a new grant by email, and revokes any grant.
 * Read-only grantees never see this panel — it is rendered only when the
 * selected property's access_role is 'owner' (HomeSnapApp).
 */
function SharingPanel({ propertyId }: { propertyId: number }) {
  const [shares, setShares] = useState<PropertyShare[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("view");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const loadShares = useCallback(async () => {
    if (!propertyId) return;
    setStatus("loading");
    try {
      const res = await listShares({ data: { property_id: propertyId } });
      setShares(((res as { shares?: PropertyShare[] }).shares as PropertyShare[]) ?? []);
      setStatus("ready");
      setLoadError("");
    } catch (err) {
      setStatus("error");
      setLoadError(messageFromError(err, "The people shared with this property couldn't be loaded."));
    }
  }, [propertyId]);

  useEffect(() => {
    void loadShares();
  }, [loadShares]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await shareProperty({ data: { property_id: propertyId, grantee_email: email, role } });
      setEmail("");
      await loadShares();
    } catch (err) {
      setError(messageFromError(err, "That person couldn't be added. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  async function revoke(s: PropertyShare) {
    if (!window.confirm(`Stop sharing this property with ${s.grantee_email ?? "this person"}?`)) {
      return;
    }
    setBusy(true);
    setError("");
    try {
      await revokeShare({
        data: { property_id: propertyId, grantee_user_id: s.grantee_user_id },
      });
      await loadShares();
    } catch (err) {
      setError(messageFromError(err, "That person couldn't be removed. Please try again."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
      <h3 className="text-sm font-semibold text-gray-200">Share with household &amp; helpers</h3>
      <p className="mt-1 text-xs text-gray-500">
        Anyone you add can see this home's records. “Can view” is read-only; “Can edit” lets them
        add and update objects, documents, and maintenance.
      </p>

      {status === "error" && <ErrorCard message={loadError} onRetry={() => void loadShares()} />}

      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-52 flex-1">
          <span className="block text-xs font-medium text-gray-400">Their DocSnap email</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="partner@example.com"
            className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 placeholder-gray-600 outline-none focus:border-indigo-500"
          />
        </label>
        <label>
          <span className="block text-xs font-medium text-gray-400">Access</span>
          <select
            value={role}
            onChange={(e) => setRole(asShareRole(e.target.value))}
            className="mt-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-gray-100 outline-none focus:border-indigo-500"
          >
            {(Object.keys(SHARE_ROLE_LABELS) as ShareRole[]).map((r) => (
              <option key={r} value={r}>
                {SHARE_ROLE_LABELS[r]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
        >
          {busy ? "Adding…" : "Share"}
        </button>
        {error && <p className="w-full text-xs text-red-400">{error}</p>}
      </form>

      {status === "loading" ? (
        <div className="mt-4 h-8 animate-pulse rounded-lg bg-gray-800/40" />
      ) : shares.length ? (
        <ul className="mt-4 space-y-2">
          {shares.map((s) => (
            <li
              key={s.grantee_user_id}
              className="flex items-center justify-between gap-3 rounded-lg border border-gray-800 bg-gray-900/40 px-3 py-2"
            >
              <div>
                <span className="block text-sm text-gray-100">{s.grantee_email ?? "Shared user"}</span>
                <span className="block text-xs text-gray-500">{SHARE_ROLE_LABELS[s.role]}</span>
              </div>
              <button
                type="button"
                onClick={() => void revoke(s)}
                className="rounded-md px-2.5 py-1 text-xs font-medium text-gray-500 transition hover:bg-red-900/30 hover:text-red-300"
              >
                Revoke
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-xs text-gray-500">
          Not shared with anyone yet — enter an email above to grant access.
        </p>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Main app                                                          */
/* ---------------------------------------------------------------- */
export function HomeSnapApp() {
  const { user, isLoaded } = useUser();
  // Optional ?property=<id>&object=<id> params let integrations (e.g. the
  // ReceiptSnap → HomeSnap flow) drop the user straight onto a created object.
  const search = useSearch({ from: "/homesnap" });
  // HomeSnap add-on entitlement: null = resolving, true = unlocked,
  // false = locked (show the upgrade screen).
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [objects, setObjects] = useState<PropertyObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [showNewProperty, setShowNewProperty] = useState(false);
  const [showNewObject, setShowNewObject] = useState(false);
  const [editingObject, setEditingObject] = useState<PropertyObject | null>(null);
  const [dueItems, setDueItems] = useState<MaintenanceDueItem[]>([]);
  // Top-level view: "home" (the property-centric record + maintenance),
  // "inventory" (the cross-home big-ticket possessions list), "analytics"
  // (the spend-over-time dashboard + printable home-sale/insurance report), or
  // "activity" (the per-property household change history).
  const [view, setView] = useState<"home" | "inventory" | "analytics" | "activity">("home");

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId) ?? null;
  const selectedObject = objects.find((o) => o.id === selectedObjectId) ?? null;
  // A 'view' grantee can read but not write; the owner and 'edit' grantees can.
  const canEdit = selectedProperty ? selectedProperty.access_role !== "view" : true;
  const isOwner = selectedProperty ? selectedProperty.access_role === "owner" : false;

  /** Load the cross-home "Maintenance due / Coming up" list. Best-effort. */
  const loadDue = useCallback(async () => {
    try {
      const res = await listDueMaintenance();
      setDueItems(((res as { schedules?: MaintenanceDueItem[] }).schedules as MaintenanceDueItem[]) ?? []);
      setConfigured((res as { configured?: boolean }).configured ?? true);
    } catch {
      // Non-fatal — the due list simply stays empty.
    }
  }, []);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await listProperties();
      setConfigured(result.configured);
      const props = (result.properties as Property[]) ?? [];
      setProperties(props);
      setStatus("ready");
      setLoadError("");
      void loadDue();
      // Integration preselect: ?property=<id>&object=<id> → open that
      // property/object so a newly added receipt lands straight on the
      // created appliance. Plain /homesnap navigation (no params) keeps the
      // original "pick a property first" behavior.
      if (search.property != null && props.some((p) => p.id === search.property)) {
        setSelectedPropertyId(search.property);
        setShowNewObject(false);
        const objResult = await listObjects({ data: { property_id: search.property } });
        setConfigured(objResult.configured);
        const objs = (objResult.objects as PropertyObject[]) ?? [];
        setObjects(objs);
        setSelectedObjectId(
          search.object != null && objs.some((o) => o.id === search.object)
            ? search.object
            : (objs[0]?.id ?? null),
        );
      }
    } catch (err) {
      setStatus("error");
      setLoadError(messageFromError(err, "Your properties could not be loaded."));
    }
  }, [search.property, search.object, loadDue]);

  // First resolve the add-on entitlement: a user without the HomeSnap add-on
  // sees the locked screen and never loads the library.
  useEffect(() => {
    if (!user) return;
    setEntitled(null);
    setStatus("loading");
    void getHomeEntitlement()
      .then((result) => {
        const has = result.configured && result.hasAddon;
        setEntitled(has);
        if (has) void load();
      })
      .catch(() => {
        setEntitled(false);
        setStatus("error");
        setLoadError("HomeSnap couldn't be unlocked right now. Please try again.");
      });
  }, [user, load]);

  async function loadObjects(propertyId: number, keepSelection: boolean) {
    try {
      const result = await listObjects({ data: { property_id: propertyId } });
      setConfigured(result.configured);
      const next = (result.objects as PropertyObject[]) ?? [];
      setObjects(next);
      if (!keepSelection) {
        setSelectedObjectId(next[0]?.id ?? null);
      }
    } catch (err) {
      setObjects([]);
      setSelectedObjectId(null);
      setLoadError(messageFromError(err, "The objects could not be loaded."));
    }
  }

  function selectProperty(propertyId: number) {
    setSelectedPropertyId(propertyId);
    setSelectedObjectId(null);
    setEditingObject(null);
    setShowNewObject(false);
    void loadObjects(propertyId, false);
  }

  /** Jump from an inventory row to its object detail (property + object). */
  function selectInventoryItem(item: InventoryItem) {
    setView("home");
    setSelectedPropertyId(item.property_id);
    setEditingObject(null);
    setShowNewObject(false);
    setSelectedObjectId(item.id);
    void listObjects({ data: { property_id: item.property_id } }).then((res) => {
      setConfigured(res.configured);
      const objs = (res.objects as PropertyObject[]) ?? [];
      setObjects(objs);
      setSelectedObjectId(
        objs.some((o) => o.id === item.id) ? item.id : (objs[0]?.id ?? null),
      );
    });
  }

  /** Jump from a Maintenance due row straight to its property + object. */
  function selectDueItem(item: MaintenanceDueItem) {
    setSelectedPropertyId(item.property_id);
    setEditingObject(null);
    setShowNewObject(false);
    setSelectedObjectId(item.object_id);
    // Refresh the objects list for that property (then ensure the object is set).
    void listObjects({ data: { property_id: item.property_id } }).then((res) => {
      setConfigured(res.configured);
      const objs = (res.objects as PropertyObject[]) ?? [];
      setObjects(objs);
      setSelectedObjectId(
        objs.some((o) => o.id === item.object_id) ? item.object_id : (objs[0]?.id ?? null),
      );
    });
  }

  async function toggleObjectStatus(obj: PropertyObject) {
    const nextStatus: ObjectStatus = obj.status === "retired" ? "active" : "retired";
    try {
      const { object } = await updateObject({
        data: { id: obj.id, status: nextStatus },
      });
      setObjects((prev) => prev.map((o) => (o.id === obj.id ? (object as PropertyObject) : o)));
    } catch (err) {
      window.alert(messageFromError(err, "The status could not be changed."));
    }
  }

  async function removeObject(obj: PropertyObject) {
    if (!window.confirm(`Delete "${obj.name}"? Its timeline and documents will be removed too.`)) {
      return;
    }
    try {
      await deleteObject({ data: { id: obj.id } });
      setObjects((prev) => prev.filter((o) => o.id !== obj.id));
      if (selectedObjectId === obj.id) setSelectedObjectId(null);
      if (editingObject?.id === obj.id) setEditingObject(null);
    } catch (err) {
      window.alert(messageFromError(err, "The object could not be deleted."));
    }
  }

  if (!isLoaded) {
    return (
      <div className="mt-8 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" aria-label="Loading HomeSnap" />
    );
  }

  if (!user) return <SignInRequired />;

  // Entitlement gate UI: locked users (including paid tiers without the
  // add-on) never see the home-record UI — only the add-on upgrade screen.
  if (entitled === null) {
    return (
      <div
        className="mt-8 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60"
        aria-label="Loading HomeSnap"
      />
    );
  }
  if (!entitled) {
    return <AddonLocked />;
  }

  return (
    <div className="mt-8 space-y-8">
      {/* View toggle: the permanent home record vs the big-ticket inventory */}
      <div className="flex items-center gap-1 rounded-full border border-gray-800 bg-gray-900/60 p-1">
        <button
          type="button"
          onClick={() => setView("home")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
            view === "home" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          🏡 Home
        </button>
        <button
          type="button"
          onClick={() => setView("inventory")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
            view === "inventory" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          📦 Inventory
        </button>
        <button
          type="button"
          onClick={() => setView("analytics")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
            view === "analytics" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          📊 Spend
        </button>
        <button
          type="button"
          onClick={() => setView("activity")}
          className={`flex-1 rounded-full px-4 py-2 text-sm font-medium transition ${
            view === "activity" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"
          }`}
        >
          🕘 Activity
        </button>
      </div>

      {view === "inventory" ? (
        <InventoryView
          configured={configured}
          properties={properties}
          defaultPropertyId={selectedPropertyId}
          onSelect={selectInventoryItem}
        />
      ) : view === "analytics" ? (
        <HomeSnapAnalytics />
      ) : view === "activity" ? (
        <HomeSnapActivity
          properties={properties}
          defaultPropertyId={selectedPropertyId}
          defaultObjectId={selectedObjectId}
          currentUserId={user.id}
        />
      ) : (
        <>
          {status === "error" && <ErrorCard message={loadError} onRetry={() => void load()} />}
          {status === "ready" && !configured && (
            <ErrorCard
              message="Storage isn't connected yet — home records can't be loaded or saved right now."
              onRetry={() => void load()}
            />
          )}

          {/* Maintenance due / Coming up */}
          {status === "ready" && configured && (
            <DueMaintenance items={dueItems} onSelect={selectDueItem} />
          )}

      {/* Properties */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="font-semibold">Your properties</h2>
            <p className="mt-1 text-sm text-gray-500">
              {properties.length} {properties.length === 1 ? "home" : "homes"} on record
            </p>
          </div>
          {!showNewProperty && (
            <button
              type="button"
              onClick={() => setShowNewProperty(true)}
              className={btnGhost}
            >
              + Add property
            </button>
          )}
        </div>

        {showNewProperty && (
          <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
            <h3 className="text-sm font-semibold text-gray-200">New property</h3>
            <PropertyForm
              configured={configured}
              onCancel={() => setShowNewProperty(false)}
              onCreated={(p) => {
                setProperties((prev) => [p, ...prev]);
                setShowNewProperty(false);
                selectProperty(p.id);
              }}
            />
          </div>
        )}

        <div className="mt-4 space-y-2">
          {status === "loading" ? (
            <div className="h-10 animate-pulse rounded-xl border border-gray-800 bg-gray-800/40" aria-label="Loading properties" />
          ) : properties.length ? (
            properties.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectProperty(p.id)}
                className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  p.id === selectedPropertyId
                    ? "border-indigo-600 bg-indigo-950/30"
                    : "border-gray-800 bg-gray-950/40 hover:border-gray-700"
                }`}
              >
                <span>
                  <span className="flex items-center gap-2">
                    <span className="block text-sm font-medium text-gray-100">{p.nickname}</span>
                    {p.access_role !== "owner" && (
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-medium ${
                          p.access_role === "edit"
                            ? "bg-amber-900/40 text-amber-300"
                            : "bg-gray-800 text-gray-400"
                        }`}
                      >
                        {PROPERTY_ACCESS_LABELS[p.access_role]}
                      </span>
                    )}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {PROPERTY_TYPE_LABELS[p.property_type]}
                    {p.purchase_date ? ` · purchased ${p.purchase_date}` : ""}
                  </span>
                </span>
                <span className="text-xs text-indigo-300">{money(p.purchase_price)}</span>
              </button>
            ))
          ) : (
            <EmptyState
              icon="🏠"
              title="No properties yet"
              body={
                configured
                  ? "Add your first home to start keeping its permanent record."
                  : "Your properties will appear here once storage is connected."
              }
            />
          )}
        </div>
      </section>

      {/* Selected property: objects */}
      {selectedProperty && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-semibold">Objects in {selectedProperty.nickname}</h2>
              <p className="mt-1 text-sm text-gray-500">
                Systems, appliances, fixtures, and improvements — each with its own
                documents and history.
              </p>
            </div>
            {!showNewObject && !editingObject && canEdit && (
              <button type="button" onClick={() => setShowNewObject(true)} className={btnGhost}>
                + Add object
              </button>
            )}
          </div>

          {isOwner && (
            <SharingPanel key={selectedProperty.id} propertyId={selectedProperty.id} />
          )}

          {(showNewObject || editingObject) && (
            <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-200">
                  {editingObject ? `Edit ${editingObject.name}` : "New object"}
                </h3>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewObject(false);
                    setEditingObject(null);
                  }}
                  className="text-xs text-gray-500 transition hover:text-gray-300"
                >
                  Close
                </button>
              </div>
              <ObjectForm
                configured={configured}
                propertyId={selectedProperty.id}
                initial={editingObject}
                onCancel={() => {
                  setShowNewObject(false);
                  setEditingObject(null);
                }}
                onSaved={(o) => {
                  setObjects((prev) => {
                    const exists = prev.some((x) => x.id === o.id);
                    return exists ? prev.map((x) => (x.id === o.id ? o : x)) : [o, ...prev];
                  });
                  setShowNewObject(false);
                  setEditingObject(null);
                  setSelectedObjectId(o.id);
                }}
              />
            </div>
          )}

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {objects.length ? (
              objects.map((o) => (
                <ObjectCard
                  key={o.id}
                  object={o}
                  selected={o.id === selectedObjectId}
                  canEdit={canEdit}
                  onSelect={() => setSelectedObjectId(o.id)}
                  onEdit={() => {
                    setShowNewObject(false);
                    setEditingObject(o);
                  }}
                  onToggleStatus={() => void toggleObjectStatus(o)}
                  onDelete={() => void removeObject(o)}
                />
              ))
            ) : (
              <div className="col-span-full">
                <EmptyState
                  icon="📦"
                  title="No objects in this home yet"
                  body={
                    configured
                      ? "Add a system, appliance, fixture, or improvement to start its record."
                      : "Objects will appear here once storage is connected."
                  }
                />
              </div>
            )}
          </div>
        </section>
      )}

      {/* Selected object: detail */}
      {selectedObject && (
        <ObjectDetail
          configured={configured}
          object={selectedObject}
          onMaintenanceChanged={loadDue}
        />
      )}

      {!selectedProperty && status === "ready" && properties.length > 0 && (
        <p className="text-center text-sm text-gray-500">Select a property above to view its objects.</p>
      )}

          <p className="pt-4 text-center text-xs text-gray-600">
            HomeSnap keeps a permanent record of your home — warranties, receipts,
            repairs, and manuals, organized around the things in your home.
          </p>
        </>
      )}
    </div>
  );
}
