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
  createDocument,
  createEvent,
  createObject,
  createProperty,
  deleteDocument,
  deleteEvent,
  deleteObject,
  getHomeEntitlement,
  listDocuments,
  listEvents,
  listObjects,
  listProperties,
  updateObject,
} from "../server";
import {
  DOCUMENT_TYPE_LABELS,
  EVENT_TYPE_LABELS,
  OBJECT_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
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
} from "../types";

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
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
        },
      });
      setTitle("");
      setNotes("");
      setOccurredOn("");
      onCreated(event as ObjectEvent);
    } catch (err) {
      setError(messageFromError(err, "The event could not be added."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 space-y-3">
      <div className="grid gap-3 sm:grid-cols-3">
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
      </div>
      <div>
        <label className={labelCls} htmlFor="hs-ev-notes">Notes</label>
        <input id="hs-ev-notes" className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Replaced air filter, cleaned coils" />
      </div>
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

const EVENT_BADGE: Record<EventType, string> = {
  installed: "bg-emerald-900/40 text-emerald-300",
  serviced: "bg-sky-900/40 text-sky-300",
  repaired: "bg-amber-900/40 text-amber-300",
  other: "bg-indigo-900/40 text-indigo-300",
};

/* ---------------------------------------------------------------- */
/* Object detail: timeline + documents                               */
/* ---------------------------------------------------------------- */
function ObjectDetail({
  configured,
  object,
}: {
  configured: boolean;
  object: PropertyObject;
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
}: {
  object: PropertyObject;
  selected: boolean;
  onSelect: () => void;
  onEdit: () => void;
  onToggleStatus: () => void;
  onDelete: () => void;
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

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId) ?? null;
  const selectedObject = objects.find((o) => o.id === selectedObjectId) ?? null;

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await listProperties();
      setConfigured(result.configured);
      const props = (result.properties as Property[]) ?? [];
      setProperties(props);
      setStatus("ready");
      setLoadError("");
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
  }, [search.property, search.object]);

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
      {status === "error" && <ErrorCard message={loadError} onRetry={() => void load()} />}
      {status === "ready" && !configured && (
        <ErrorCard
          message="Storage isn't connected yet — home records can't be loaded or saved right now."
          onRetry={() => void load()}
        />
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
                  <span className="block text-sm font-medium text-gray-100">{p.nickname}</span>
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
            {!showNewObject && !editingObject && (
              <button type="button" onClick={() => setShowNewObject(true)} className={btnGhost}>
                + Add object
              </button>
            )}
          </div>

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
      {selectedObject && <ObjectDetail configured={configured} object={selectedObject} />}

      {!selectedProperty && status === "ready" && properties.length > 0 && (
        <p className="text-center text-sm text-gray-500">Select a property above to view its objects.</p>
      )}

      <p className="pt-4 text-center text-xs text-gray-600">
        HomeSnap keeps a permanent record of your home — warranties, receipts,
        repairs, and manuals, organized around the things in your home.
      </p>
    </div>
  );
}
