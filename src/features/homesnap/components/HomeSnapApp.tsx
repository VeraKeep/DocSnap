/**
 * HomeSnap — read/write home-record UI.
 *
 * A self-contained module view in DocSnap's dark gray/indigo treatment:
 * auth gate, then the user's properties, the objects under a selected
 * property, and — for a selected object — its documents and timeline.
 * Every data path is owner-scoped server-side (see server.ts); this
 * component only handles presentation and form state, and renders
 * every loading/empty/error/unconfigured state honestly (no fabricated rows).
 *
 * This phase ships the core object model + timeline + documents. ReceiptSnap/
 * GarageSnap integrations, maintenance reminders, and inventory are out of
 * scope (later phases).
 */
import { useCallback, useEffect, useState } from "react";
import { SignInButton, useUser } from "@clerk/tanstack-start";
import {
  createDocument,
  createEvent,
  createObject,
  createProperty,
  listDocuments,
  listEvents,
  listObjects,
  listProperties,
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
  type ObjectType,
  type Property,
  type PropertyObject,
  type PropertyType,
} from "../types";

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
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

const inputCls =
  "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-400";

function selectOptions<T extends string>(map: Record<T, string>): T[] {
  return Object.keys(map) as T[];
}

/* ---------------------------------------------------------------- */
/* New-property form                                                 */
/* ---------------------------------------------------------------- */
function NewPropertyForm({
  configured,
  onCreated,
}: {
  configured: boolean;
  onCreated: (p: Property) => void;
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
            className={inputCls}
            value={purchaseDate}
            onChange={(e) => setPurchaseDate(e.target.value)}
            placeholder="e.g. 2024-05-01"
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
      <button
        type="submit"
        disabled={busy || !configured}
        className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? "Saving…" : "Add property"}
      </button>
    </form>
  );
}

/* ---------------------------------------------------------------- */
/* New-object form                                                   */
/* ---------------------------------------------------------------- */
function NewObjectForm({
  configured,
  propertyId,
  onCreated,
}: {
  configured: boolean;
  propertyId: number;
  onCreated: (o: PropertyObject) => void;
}) {
  const [name, setName] = useState("");
  const [objectType, setObjectType] = useState<ObjectType>("system");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [serial, setSerial] = useState("");
  const [room, setRoom] = useState("");
  const [warranty, setWarranty] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const { object } = await createObject({
        data: {
          property_id: propertyId,
          object_type: objectType,
          name,
          manufacturer: manufacturer || null,
          model: model || null,
          serial_number: serial || null,
          room_location: room || null,
          warranty_expiration: warranty || null,
        },
      });
      setName("");
      setManufacturer("");
      setModel("");
      setSerial("");
      setRoom("");
      setWarranty("");
      onCreated(object as PropertyObject);
    } catch (err) {
      setError(messageFromError(err, "The object could not be created."));
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
      </div>
      <div>
        <label className={labelCls} htmlFor="hs-obj-warranty">Warranty expiration</label>
        <input id="hs-obj-warranty" className={inputCls} value={warranty} onChange={(e) => setWarranty(e.target.value)} placeholder="e.g. 2036-02-01" />
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || !configured}
        className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? "Saving…" : "Add object"}
      </button>
    </form>
  );
}

/* ---------------------------------------------------------------- */
/* Timeline + documents forms (attached to a selected object)         */
/* ---------------------------------------------------------------- */
function NewEventForm({
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
          <input id="hs-ev-date" className={inputCls} value={occurredOn} onChange={(e) => setOccurredOn(e.target.value)} placeholder="e.g. 2026-03-15" />
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
      <button
        type="submit"
        disabled={busy || !configured}
        className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? "Adding…" : "Add to timeline"}
      </button>
    </form>
  );
}

function NewDocumentForm({
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
        },
      });
      setTitle("");
      setFileUrl("");
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
          <input id="hs-doc-url" className={inputCls} value={fileUrl} onChange={(e) => setFileUrl(e.target.value)} placeholder="https://…" required />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <button
        type="submit"
        disabled={busy || !configured}
        className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45"
      >
        {busy ? "Adding…" : "Attach document"}
      </button>
    </form>
  );
}

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

  const warranty = object.warranty_expiration
    ? ` · Warranty until ${object.warranty_expiration}`
    : "";
  const meta = [object.manufacturer, object.model]
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
          {object.room_location ? ` · ${object.room_location}` : ""}
          {warranty}
        </p>
        {object.serial_number && (
          <p className="mt-1 text-xs text-gray-500">Serial: {object.serial_number}</p>
        )}
        {object.notes && <p className="mt-2 text-sm text-gray-300">{object.notes}</p>}
      </div>

      {status === "error" && <ErrorCard message={loadError} onRetry={() => void load(object)} />}

      {/* Timeline */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
        <h4 className="font-semibold">Timeline</h4>
        <div className="mt-3 space-y-2">
          {status === "loading" ? (
            <div className="h-14 animate-pulse rounded-xl border border-gray-800 bg-gray-800/40" aria-label="Loading timeline" />
          ) : events.length ? (
            events.map((ev) => (
              <div key={ev.id} className="flex gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3">
                <span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-indigo-900/40 px-2 py-0.5 text-xs font-medium text-indigo-300">
                      {EVENT_TYPE_LABELS[ev.event_type]}
                    </span>
                    <span className="text-sm font-medium text-gray-200">
                      {ev.title ?? "Untitled event"}
                    </span>
                    {ev.occurred_on && (
                      <span className="text-xs text-gray-500">{ev.occurred_on}</span>
                    )}
                  </div>
                  {ev.notes && <p className="mt-1 text-sm text-gray-400">{ev.notes}</p>}
                </div>
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-gray-800 p-4 text-center text-sm text-gray-500">
              {!configured
                ? "Timeline entries will appear here once storage is connected."
                : "No timeline entries yet. Add one below."}
            </p>
          )}
        </div>
        {events.length < 3 && (
          <details className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-3">
            <summary className="cursor-pointer text-sm font-medium text-indigo-300">
              Add a timeline entry
            </summary>
            <NewEventForm
              configured={configured}
              objectId={object.id}
              onCreated={(ev) => setEvents((prev) => [...prev, ev])}
            />
          </details>
        )}
      </section>

      {/* Documents */}
      <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5">
        <h4 className="font-semibold">Documents</h4>
        <div className="mt-3 space-y-2">
          {status === "loading" ? (
            <div className="h-14 animate-pulse rounded-xl border border-gray-800 bg-gray-800/40" aria-label="Loading documents" />
          ) : documents.length ? (
            documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 rounded-xl border border-gray-800 bg-gray-950/40 p-3">
                <span className="rounded-full bg-gray-800 px-2 py-0.5 text-xs font-medium text-gray-300">
                  {DOCUMENT_TYPE_LABELS[doc.document_type]}
                </span>
                <a
                  href={doc.file_url}
                  target="_blank"
                  rel="noreferrer"
                  className="min-w-0 truncate text-sm font-medium text-indigo-300 transition hover:text-indigo-200"
                >
                  {doc.title ?? doc.file_url}
                </a>
                {doc.notes && <span className="ml-auto hidden text-xs text-gray-500 sm:block">{doc.notes}</span>}
              </div>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-gray-800 p-4 text-center text-sm text-gray-500">
              {!configured
                ? "Documents will appear here once storage is connected."
                : "No documents attached yet."}
            </p>
          )}
        </div>
        {documents.length < 3 && (
          <details className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-3">
            <summary className="cursor-pointer text-sm font-medium text-indigo-300">
              Attach a document
            </summary>
            <NewDocumentForm
              configured={configured}
              objectId={object.id}
              onCreated={(d) => setDocuments((prev) => [...prev, d])}
            />
          </details>
        )}
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Main app                                                          */
/* ---------------------------------------------------------------- */
export function HomeSnapApp() {
  const { user, isLoaded } = useUser();
  const [configured, setConfigured] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [selectedPropertyId, setSelectedPropertyId] = useState<number | null>(null);
  const [objects, setObjects] = useState<PropertyObject[]>([]);
  const [selectedObjectId, setSelectedObjectId] = useState<number | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [showNewProperty, setShowNewProperty] = useState(false);

  const selectedProperty = properties.find((p) => p.id === selectedPropertyId) ?? null;
  const selectedObject = objects.find((o) => o.id === selectedObjectId) ?? null;

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await listProperties();
      setConfigured(result.configured);
      setProperties(result.properties as Property[]);
      setStatus("ready");
      setLoadError("");
    } catch (err) {
      setStatus("error");
      setLoadError(messageFromError(err, "Your properties could not be loaded."));
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
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
    void loadObjects(propertyId, false);
  }

  if (!isLoaded) {
    return (
      <div className="mt-8 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" aria-label="Loading HomeSnap" />
    );
  }

  if (!user) return <SignInRequired />;

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
              className="rounded-full border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-800"
            >
              + Add property
            </button>
          )}
        </div>

        {showNewProperty && (
          <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-200">New property</h3>
              <button
                type="button"
                onClick={() => setShowNewProperty(false)}
                className="text-xs text-gray-500 transition hover:text-gray-300"
              >
                Cancel
              </button>
            </div>
            <NewPropertyForm
              configured={configured}
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
                <span className="text-xs text-indigo-300">{p.purchase_price ? `$${p.purchase_price.toLocaleString()}` : ""}</span>
              </button>
            ))
          ) : (
            <p className="rounded-xl border border-dashed border-gray-800 p-6 text-center text-sm text-gray-500">
              {!configured
                ? "Your properties will appear here once storage is connected."
                : "No properties yet. Add your first home to start keeping its record."}
            </p>
          )}
        </div>
      </section>

      {/* Selected property: objects */}
      {selectedProperty && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
          <h2 className="font-semibold">Objects in {selectedProperty.nickname}</h2>
          <p className="mt-1 text-sm text-gray-500">
            Systems, appliances, fixtures, and improvements — each with its own
            documents and history.
          </p>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {objects.length ? (
              objects.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setSelectedObjectId(o.id)}
                  className={`rounded-xl border px-4 py-3 text-left transition ${
                    o.id === selectedObjectId
                      ? "border-indigo-600 bg-indigo-950/30"
                      : "border-gray-800 bg-gray-950/40 hover:border-gray-700"
                  }`}
                >
                  <span className="block truncate text-sm font-medium text-gray-100">{o.name}</span>
                  <span className="block truncate text-xs text-gray-500">
                    {OBJECT_TYPE_LABELS[o.object_type]}
                    {o.room_location ? ` · ${o.room_location}` : ""}
                  </span>
                </button>
              ))
            ) : (
              <p className="col-span-full rounded-xl border border-dashed border-gray-800 p-6 text-center text-sm text-gray-500">
                No objects yet in this property.
              </p>
            )}
          </div>

          <details className="mt-4 rounded-xl border border-gray-800 bg-gray-950/40 p-4">
            <summary className="cursor-pointer text-sm font-medium text-indigo-300">
              Add an object
            </summary>
            <NewObjectForm
              configured={configured}
              propertyId={selectedProperty.id}
              onCreated={(o) => {
                setObjects((prev) => [o, ...prev]);
                setSelectedObjectId(o.id);
              }}
            />
          </details>
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
