/**
 * GarageSnap — read/write workshop-inventory UI.
 *
 * A self-contained module view in DocSnap's dark gray/indigo treatment:
 * auth gate, add-on entitlement gate, then the user's garage items as cards
 * (photo, name, category badge, make/model/serial, storage location, warranty
 * status) with an add/edit form and an empty state. Every data path is
 * owner-scoped server-side (see server.ts); this component only handles
 * presentation and form state, and renders every loading/empty/error/
 * unconfigured state honestly (no fabricated rows).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { SignInButton, useUser } from "@clerk/tanstack-start";
import {
  createGarageItem,
  deleteGarageItem,
  getGarageSnapEntitlement,
  listGarageItems,
  updateGarageItem,
} from "../server";
import {
  GARAGE_CATEGORY_LABELS,
  asGarageCategory,
  warrantyStatus,
  type GarageCategory,
  type GarageItem,
} from "../types";

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

/** Today as yyyy-mm-dd (local), for warranty bucketing client-side. */
function todayLocal(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function money(v: number | null): string {
  return v == null ? "" : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

const inputCls =
  "w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 placeholder:text-gray-500 transition focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";
const labelCls = "mb-1 block text-xs font-medium text-gray-400";
const btnPrimary =
  "rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-45";
const btnGhost =
  "rounded-full border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-45";

const CATEGORY_BADGE: Record<GarageCategory, string> = {
  power_tool: "bg-indigo-900/40 text-indigo-300",
  hand_tool: "bg-sky-900/40 text-sky-300",
  equipment: "bg-emerald-900/40 text-emerald-300",
  supply: "bg-violet-900/40 text-violet-300",
  other: "bg-gray-800 text-gray-300",
};

function CategoryBadge({ category }: { category: GarageCategory }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CATEGORY_BADGE[category]}`}>
      {GARAGE_CATEGORY_LABELS[category]}
    </span>
  );
}

function WarrantyBadge({ status }: { status: "none" | "active" | "expired" }) {
  if (status === "none") return null;
  const cls =
    status === "active"
      ? "bg-emerald-900/40 text-emerald-300"
      : "bg-amber-900/40 text-amber-300";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${cls}`}>
      {status === "active" ? "● Warranted" : "● Warranty expired"}
    </span>
  );
}

function SignInRequired() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20 text-3xl">
        🔧
      </div>
      <h2 className="mt-5 text-xl font-semibold">Sign in to open GarageSnap</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        GarageSnap remembers every tool and piece of equipment you own, where it
        lives, and the warranties that go with it. Your workshop inventory stays
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
 * Locked / upgrade screen — shown to a signed-in user WITHOUT the GarageSnap
 * add-on. GarageSnap is a paid add-on sold on the DocSnap side
 * (business-plan rev 16) and is NOT bundled into any tier, so even a paid
 * subscriber sees this until they own the add-on.
 */
function AddonLocked() {
  return (
    <div className="mt-8 rounded-2xl border border-gray-800 bg-gray-900/60 p-8 text-center sm:p-12">
      <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-indigo-600/20 text-3xl">
        🔧
      </div>
      <h2 className="mt-5 text-xl font-semibold">GarageSnap is a paid add-on</h2>
      <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-gray-400">
        GarageSnap isn't included in DocSnap plans — it's a separate add-on.
        Purchase it to inventory your tools and equipment with photos,
        make/model and serial numbers, warranties, and storage locations.
      </p>
      <Link
        to="/pricing"
        className="mt-6 inline-flex rounded-full bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
      >
        See plans &amp; buy GarageSnap
      </Link>
      <p className="mt-4 text-xs text-gray-600">
        Your workshop inventory stays private to your DocSnap account.
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

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-xl border border-dashed border-gray-800 p-10 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-gray-800/60 text-2xl">
        🔧
      </div>
      <h3 className="mt-3 text-sm font-semibold text-gray-200">{title}</h3>
      <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{body}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- */
/* Item form (create + edit)                                         */
/* ---------------------------------------------------------------- */
function ItemForm({
  configured,
  initial,
  onSaved,
  onCancel,
}: {
  configured: boolean;
  initial?: GarageItem | null;
  onSaved: (item: GarageItem) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [category, setCategory] = useState<GarageCategory>(initial?.category ?? "power_tool");
  const [make, setMake] = useState(initial?.make ?? "");
  const [model, setModel] = useState(initial?.model ?? "");
  const [serial, setSerial] = useState(initial?.serial_number ?? "");
  const [photoUrl, setPhotoUrl] = useState(initial?.photo_url ?? "");
  const [purchaseDate, setPurchaseDate] = useState(initial?.purchase_date ?? "");
  const [price, setPrice] = useState(initial?.purchase_price != null ? String(initial.purchase_price) : "");
  const [warranty, setWarranty] = useState(initial?.warranty_expiration ?? "");
  const constStorage = useState(initial?.storage_location ?? "");
  const [storage, setStorage] = constStorage;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const payload = {
      name,
      category,
      make: make || null,
      model: model || null,
      serial_number: serial || null,
      photo_url: photoUrl || null,
      purchase_date: purchaseDate || null,
      purchase_price: price || null,
      warranty_expiration: warranty || null,
      storage_location: storage || null,
    };
    try {
      if (initial) {
        const { item } = await updateGarageItem({ data: { id: initial.id, ...payload } });
        onSaved(item as GarageItem);
      } else {
        const { item } = await createGarageItem({ data: payload });
        onSaved(item as GarageItem);
      }
    } catch (err) {
      setError(messageFromError(err, "The item could not be saved."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls} htmlFor="gs-name">Item name</label>
          <input id="gs-name" className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="Cordless drill" required />
        </div>
        <div>
          <label className={labelCls} htmlFor="gs-category">Category</label>
          <select id="gs-category" className={inputCls} value={category} onChange={(e) => setCategory(asGarageCategory(e.target.value))}>
            {(Object.keys(GARAGE_CATEGORY_LABELS) as GarageCategory[]).map((c) => (
              <option key={c} value={c}>{GARAGE_CATEGORY_LABELS[c]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls} htmlFor="gs-make">Make</label>
          <input id="gs-make" className={inputCls} value={make} onChange={(e) => setMake(e.target.value)} placeholder="Milwaukee" />
        </div>
        <div>
          <label className={labelCls} htmlFor="gs-model">Model</label>
          <input id="gs-model" className={inputCls} value={model} onChange={(e) => setModel(e.target.value)} placeholder="M18 FUEL" />
        </div>
        <div>
          <label className={labelCls} htmlFor="gs-serial">Serial #</label>
          <input id="gs-serial" className={inputCls} value={serial} onChange={(e) => setSerial(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="gs-storage">Storage location</label>
          <input id="gs-storage" className={inputCls} value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="Wall 01 · Bay A" />
        </div>
        <div>
          <label className={labelCls} htmlFor="gs-purchase">Purchase date</label>
          <input id="gs-purchase" type="date" className={inputCls} value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
        </div>
        <div>
          <label className={labelCls} htmlFor="gs-price">Price</label>
          <input id="gs-price" className={inputCls} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="e.g. 249" inputMode="decimal" />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="gs-warranty">Warranty expiration</label>
          <input id="gs-warranty" type="date" className={inputCls} value={warranty} onChange={(e) => setWarranty(e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls} htmlFor="gs-photo">Photo link (optional)</label>
          <input id="gs-photo" type="url" className={inputCls} value={photoUrl} onChange={(e) => setPhotoUrl(e.target.value)} placeholder="https://… item photo" />
        </div>
      </div>
      {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
      <div className="flex items-center gap-3">
        <button type="submit" disabled={busy || !configured} className={btnPrimary}>
          {busy ? "Saving…" : initial ? "Save changes" : "Add item"}
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
/* Item card                                                         */
/* ---------------------------------------------------------------- */
function ItemCard({
  item,
  onSelect,
}: {
  item: GarageItem;
  onSelect: () => void;
}) {
  const warranty = warrantyStatus(item.warranty_expiration, todayLocal());
  const meta = [item.make, item.model].filter(Boolean).join(" ");
  return (
    <button
      type="button"
      onClick={onSelect}
      className="flex flex-col overflow-hidden rounded-2xl border border-gray-800 bg-gray-900/60 text-left transition hover:border-gray-600"
    >
      <div className="relative h-36 w-full overflow-hidden bg-gray-800/60">
        {item.photo_url ? (
          <img src={item.photo_url} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <div className="grid h-full w-full place-items-center text-4xl">🔧</div>
        )}
        <span className="absolute left-2.5 top-2.5">
          <CategoryBadge category={item.category} />
        </span>
      </div>
      <div className="px-3.5 py-3">
        <h3 className="truncate text-sm font-semibold text-gray-100">{item.name}</h3>
        {meta && <p className="mt-0.5 truncate text-xs text-gray-500">{meta}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {item.storage_location && (
            <span className="truncate text-[11px] text-gray-400">⌖ {item.storage_location}</span>
          )}
          <WarrantyBadge status={warranty} />
        </div>
        {item.serial_number && (
          <p className="mt-1 truncate text-[11px] text-gray-600">S/N {item.serial_number}</p>
        )}
        <div className="mt-2 flex items-center justify-between gap-2">
          {item.purchase_price != null && (
            <span className="text-sm font-semibold text-emerald-300">{money(item.purchase_price)}</span>
          )}
          <span className="ml-auto shrink-0 text-gray-600 transition group-hover:text-gray-300">↗</span>
        </div>
      </div>
    </button>
  );
}

/* ---------------------------------------------------------------- */
/* Main app                                                          */
/* ---------------------------------------------------------------- */
export function GarageSnapApp() {
  const { user, isLoaded } = useUser();
  const [entitled, setEntitled] = useState<boolean | null>(null);
  const [configured, setConfigured] = useState(true);
  const [items, setItems] = useState<GarageItem[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<GarageCategory | "all">("all");
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<GarageItem | null>(null);
  const [selected, setSelected] = useState<GarageItem | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const result = await listGarageItems();
      setConfigured(result.configured);
      setItems((result.items as GarageItem[]) ?? []);
      setStatus("ready");
      setLoadError("");
    } catch (err) {
      setStatus("error");
      setLoadError(messageFromError(err, "Your garage items could not be loaded."));
    }
  }, []);

  // First resolve the add-on entitlement: a user without the GarageSnap
  // add-on sees the locked screen and never loads the inventory.
  useEffect(() => {
    if (!user) return;
    setEntitled(null);
    setStatus("loading");
    void getGarageSnapEntitlement()
      .then((result) => {
        const has = result.configured && result.hasAddon;
        setEntitled(has);
        if (has) void load();
      })
      .catch(() => {
        setEntitled(false);
        setStatus("error");
        setLoadError("GarageSnap couldn't be unlocked right now. Please try again.");
      });
  }, [user, load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (categoryFilter !== "all" && i.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        (i.make ?? "").toLowerCase().includes(q) ||
        (i.model ?? "").toLowerCase().includes(q) ||
        (i.serial_number ?? "").toLowerCase().includes(q) ||
        (i.storage_location ?? "").toLowerCase().includes(q)
      );
    });
  }, [items, query, categoryFilter]);

  async function removeItem(item: GarageItem) {
    if (confirmDeleteId !== item.id) {
      setConfirmDeleteId(item.id);
      return;
    }
    try {
      await deleteGarageItem({ data: { id: item.id } });
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      setSelected(null);
      setConfirmDeleteId(null);
    } catch (err) {
      window.alert(messageFromError(err, "The item could not be deleted."));
    }
  }

  if (!isLoaded) {
    return (
      <div className="mt-8 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" aria-label="Loading GarageSnap" />
    );
  }

  if (!user) return <SignInRequired />;

  if (entitled === null) {
    return (
      <div className="mt-8 h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" aria-label="Loading GarageSnap" />
    );
  }
  if (!entitled) return <AddonLocked />;

  return (
    <div className="mt-8 space-y-6">
      {status === "error" && <ErrorCard message={loadError} onRetry={() => void load()} />}
      {status === "ready" && !configured && (
        <ErrorCard
          message="Storage isn't connected yet — garage items can't be loaded or saved right now."
          onRetry={() => void load()}
        />
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2.5 focus-within:border-gray-600">
          <span className="text-gray-500" aria-hidden="true">⌕</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, make, serial, or location"
            className="w-full min-w-0 bg-transparent text-sm text-gray-200 placeholder-gray-600 outline-none"
          />
        </div>
        <select
          className="rounded-xl border border-gray-700 bg-gray-900 px-3 py-2.5 text-sm text-gray-300 outline-none transition focus:border-indigo-500"
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value === "all" ? "all" : asGarageCategory(e.target.value))}
        >
          <option value="all">All categories</option>
          {(Object.keys(GARAGE_CATEGORY_LABELS) as GarageCategory[]).map((c) => (
            <option key={c} value={c}>{GARAGE_CATEGORY_LABELS[c]}</option>
          ))}
        </select>
        {!showForm && !editingItem && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-600/25 transition hover:bg-indigo-500 active:scale-95"
          >
            <span className="text-base leading-none">+</span> Add item
          </button>
        )}
      </div>

      {/* Add/edit form */}
      {(showForm || editingItem) && (
        <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-semibold">{editingItem ? `Edit ${editingItem.name}` : "Add an item"}</h2>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setEditingItem(null);
              }}
              className="text-xs text-gray-500 transition hover:text-gray-300"
            >
              Close
            </button>
          </div>
          <ItemForm
            configured={configured && status === "ready"}
            initial={editingItem}
            onCancel={() => {
              setShowForm(false);
              setEditingItem(null);
            }}
            onSaved={(item) => {
              setItems((prev) =>
                editingItem ? prev.map((x) => (x.id === item.id ? item : x)) : [item, ...prev],
              );
              setSelected(item);
              setShowForm(false);
              setEditingItem(null);
            }}
          />
        </section>
      )}

      {/* Grid / empty state */}
      {status === "loading" ? (
        <div className="h-40 animate-pulse rounded-2xl border border-gray-800 bg-gray-900/60" aria-label="Loading items" />
      ) : filtered.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((item) => (
            <ItemCard
              key={item.id}
              item={item}
              onSelect={() => {
                setSelected(item);
                setConfirmDeleteId(null);
              }}
            />
          ))}
        </div>
      ) : status === "ready" ? (
        <EmptyState
          title={items.length ? "Nothing matches your search" : "No garage items yet"}
          body={
            items.length
              ? "Try a different category or search term."
              : configured
                ? "Add your first tool or piece of equipment — each with its photo, make/model, serial, warranty, and storage location."
                : "Your garage items will appear here once storage is connected."
          }
        />
      ) : null}

      {status === "ready" && items.length > 0 && (
        <p className="text-xs text-gray-500">
          {items.length} {items.length === 1 ? "item" : "items"} on record
        </p>
      )}

      {/* Detail drawer */}
      {selected && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
          onClick={() => setSelected(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute inset-y-0 right-0 w-full max-w-md overflow-y-auto border-l border-gray-800 bg-gray-950 p-5 shadow-2xl"
          >
            {selected.photo_url ? (
              <img src={selected.photo_url} alt={selected.name} className="h-56 w-full rounded-xl object-cover" />
            ) : (
              <div className="grid h-56 w-full place-items-center rounded-xl bg-gray-900 text-4xl">🔧</div>
            )}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <CategoryBadge category={selected.category} />
              <WarrantyBadge status={warrantyStatus(selected.warranty_expiration, todayLocal())} />
            </div>
            <h2 className="mt-2 text-xl font-bold text-white">{selected.name}</h2>
            {[selected.make, selected.model].filter(Boolean).length > 0 && (
              <p className="mt-1 text-sm text-gray-400">
                {[selected.make, selected.model].filter(Boolean).join(" ")}
              </p>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3">
              {selected.storage_location && (
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Location</p>
                  <p className="mt-1 text-sm font-medium text-gray-200">{selected.storage_location}</p>
                </div>
              )}
              {selected.serial_number && (
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Serial number</p>
                  <p className="mt-1 break-words text-sm font-medium text-gray-200">{selected.serial_number}</p>
                </div>
              )}
              {selected.purchase_date && (
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Purchased</p>
                  <p className="mt-1 text-sm font-medium text-gray-200">{selected.purchase_date}</p>
                </div>
              )}
              {selected.purchase_price != null && (
                <div className="rounded-xl border border-gray-800 bg-gray-900/60 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">Price</p>
                  <p className="mt-1 text-sm font-semibold text-emerald-300">{money(selected.purchase_price)}</p>
                </div>
              )}
            </div>

            <div className="mt-4 rounded-xl border border-gray-800 bg-gray-900/60 p-4">
              <h4 className="text-xs font-semibold text-gray-300">Warranty</h4>
              <p className="mt-1 text-sm text-gray-400">
                {selected.warranty_expiration
                  ? `Covered until ${selected.warranty_expiration}`
                  : "Not recorded"}
              </p>
            </div>

            <div className="mt-6 flex flex-col gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setEditingItem(selected);
                  setSelected(null);
                }}
                className="rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Edit item
              </button>
              <button
                type="button"
                onClick={() => void removeItem(selected)}
                className={`rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  confirmDeleteId === selected.id
                    ? "bg-red-600 text-white hover:bg-red-500"
                    : "border border-gray-700 text-gray-400 hover:border-red-700/60 hover:text-red-400"
                }`}
              >
                {confirmDeleteId === selected.id ? "Confirm delete?" : "Delete item"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
