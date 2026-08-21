import { useEffect, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  createObjectFromReceipt,
  getHomeEntitlement,
} from "../../homesnap/server";
import {
  type ReceiptDetail,
  type ReceiptItem,
  displayDate,
  displayText,
  formatTotal,
} from "../types";

/** Lock body scroll while the modal is open. */
function useLockScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [active]);
}

/** A single extracted field: label + normalized value. */
function Field({ label, value }: { label: string; value: unknown }) {
  const text = displayText(value);
  if (!text) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </dt>
      <dd className="mt-1 text-sm text-gray-200">{text}</dd>
    </div>
  );
}

/** Highlighted chip list for warranty / serial-number references. */
function ChipList({ label, values }: { label: string; values: unknown[] }) {
  if (!values.length) return null;
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-gray-500">
        {label}
      </dt>
      <dd className="mt-2 flex flex-wrap gap-2">
        {values.map((value, i) => (
          <span
            key={i}
            className="rounded-full border border-indigo-500/40 bg-indigo-500/10 px-3 py-1 text-xs font-medium text-indigo-200"
          >
            {String(value)}
          </span>
        ))}
      </dd>
    </div>
  );
}

/** One line item: name, quantity, unit price, line total, SKU/model/serial. */
function ItemCard({ item, currency }: { item: ReceiptItem; currency: unknown }) {
  const name = displayText(item.name) ?? "Item";
  const quantity = item.quantity != null ? `qty ${String(item.quantity)}` : null;
  const unitPrice = item.unit_price != null ? `@ ${formatTotal(item.unit_price, currency)}` : null;
  const lineTotal = item.line_total != null ? formatTotal(item.line_total, currency) : null;
  const chips = [displayText(item.sku), displayText(item.model), displayText(item.serial)]
    .filter((c): c is string => Boolean(c));

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/60 px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <strong className="min-w-0 truncate text-sm font-semibold text-gray-100">
          {name}
        </strong>
        {lineTotal && (
          <span className="shrink-0 text-sm font-medium text-indigo-300">
            {lineTotal}
          </span>
        )}
      </div>
      {(quantity || unitPrice || chips.length > 0) && (
        <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
          {quantity && <span>{quantity}</span>}
          {unitPrice && <span>{unitPrice}</span>}
          {chips.map((chip, i) => (
            <span
              key={i}
              className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-[10px] text-gray-400"
            >
              {chip}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// Fixed presentation order for the fields AI extraction stores in `extra`.
const EXTRA_FIELDS: Array<{ key: string; label: string }> = [
  { key: "store_address", label: "Store address" },
  { key: "time", label: "Time" },
  { key: "subtotal", label: "Subtotal" },
  { key: "tax", label: "Tax" },
  { key: "payment_method", label: "Payment method" },
  { key: "receipt_number", label: "Receipt number" },
];

const HIGHLIGHT_FIELDS: Array<{ key: string; label: string }> = [
  { key: "warranty_references", label: "Warranty references" },
  { key: "serial_numbers", label: "Serial numbers" },
];

// Keys consumed by the summary header / explicit sections; anything else in
// `extra` still renders (sorted) so no extracted data is ever hidden.
const KNOWN_KEYS = new Set([
  "items",
  "merchant",
  "store_date",
  "date",
  "total",
  "currency",
  ...EXTRA_FIELDS.map((f) => f.key),
  ...HIGHLIGHT_FIELDS.map((f) => f.key),
]);

interface ReceiptDetailModalProps {
  receipt: ReceiptDetail;
  onClose: () => void;
}

/**
 * Detail modal: the original receipt image beside every extracted field and
 * line item. Closes on backdrop click, the × button, or Escape.
 */
/**
 * ReceiptSnap → HomeSnap integration card.
 *
 * Shown on a receipt that looks like a home purchase (has a product line or a
 * non-trivial total). Resolves the HomeSnap add-on entitlement server-side
 * (fails closed): unlocked owners get a prominent "Add this appliance to
 * HomeSnap?" button that creates the object from the receipt and drops them
 * into HomeSnap on the new object; locked users get a friendly upgrade CTA to
 * the module/buy flow instead.
 */
function AddToHomeSnapCard({ receipt, onDone }: { receipt: ReceiptDetail; onDone: () => void }) {
  const navigate = useNavigate();
  // HomeSnap entitlement: null = resolving (render nothing to avoid flashing
  // the locked state before we know), true/false = decided.
  const [homeSnap, setHomeSnap] = useState<boolean | null>(null);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (homeSnap !== null) return;
    void getHomeEntitlement()
      .then((result) => setHomeSnap(result.configured && result.hasAddon))
      .catch(() => setHomeSnap(false));
  }, [homeSnap]);
  // Looks like a home purchase: has at least one product line item, or a
  // non-trivial total. Guards the card so grocery/coffee receipts don't
  // nag about tracking appliances.
  const items = Array.isArray(receipt.items) ? (receipt.items as ReceiptItem[]) : [];
  const looksLikeHomePurchase =
    items.length > 0 ||
    (typeof receipt.total === "number" && receipt.total > 0);
  if (!looksLikeHomePurchase || homeSnap === null) return null;
  if (!homeSnap) {
    return (
      <div className="rounded-2xl border border-indigo-500/30 bg-indigo-950/20 p-5">
        <p className="text-sm font-semibold text-gray-100">
          Get HomeSnap to track this appliance
        </p>
        <p className="mt-1 text-xs leading-relaxed text-gray-400">
          HomeSnap keeps a permanent record of your home's systems and
          appliances — manufacturer, model, serial number, warranty, and this
          receipt — all in one place. It's a separate DocSnap add-on.
        </p>
        <Link
          to="/pricing"
          className="mt-3 inline-flex rounded-full bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500"
        >
          See plans &amp; buy HomeSnap
        </Link>
      </div>
    );
  }
  async function addToHomeSnap() {
    setAdding(true);
    setError("");
    try {
      const result = await createObjectFromReceipt({
        data: { receipt_id: receipt.id },
      });
      onDone();
      await navigate({
        to: "/homesnap",
        search: { property: result.property_id, object: result.object.id },
      });
    } catch (err) {
      setError(
        err instanceof Error && err.message.trim()
          ? err.message
          : "The appliance could not be added. Please try again.",
      );
    } finally {
      setAdding(false);
    }
  }
  const firstItem = items[0];
  const preview =
    displayText(firstItem?.name) ??
    displayText(receipt.extra?.manufacturer) ??
    displayText(receipt.extra?.brand) ??
    "this purchase";
  return (
    <div className="rounded-2xl border border-indigo-500/40 bg-gradient-to-r from-indigo-950/40 to-gray-950/40 p-5">
      <p className="text-sm font-semibold text-gray-100">
        Add this appliance to HomeSnap?
      </p>
      <p className="mt-1 text-xs leading-relaxed text-gray-400">
        Create a HomeSnap record for “{preview}” with this receipt attached, so
        its model, serial, warranty, and history live with your home.
      </p>
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      <button
        type="button"
        disabled={adding}
        onClick={() => void addToHomeSnap()}
        className="mt-3 inline-flex items-center gap-2 rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
      >
        {adding ? (
          "Adding…"
        ) : (
          <>
            <span aria-hidden="true">🏡</span> Add to HomeSnap
          </>
        )}
      </button>
    </div>
  );
}
export function ReceiptDetailModal({ receipt, onClose }: ReceiptDetailModalProps) {
  useLockScroll(true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const extra = (receipt.extra ?? {}) as Record<string, unknown>;
  const items = Array.isArray(receipt.items) ? (receipt.items as ReceiptItem[]) : [];
  const date =
    (receipt.store_date ? displayDate(receipt.store_date) : null) ??
    displayText(extra.date) ??
    "Date unavailable";
  const otherFields = Object.entries(extra)
    .filter(([key]) => !KNOWN_KEYS.has(key))
    .sort(([a], [b]) => a.localeCompare(b));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${receipt.merchant || "Receipt"} details`}
      className="fixed inset-0 z-50 overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:p-6"
      onClick={onClose}
    >
      <div
        className="mx-auto mt-6 w-full max-w-4xl rounded-3xl border border-gray-800 bg-gray-950 p-5 shadow-2xl sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-400">
              Receipt details
            </p>
            <h2 className="mt-1.5 truncate text-2xl font-bold tracking-tight sm:text-3xl">
              {receipt.merchant || "Unknown merchant"}
            </h2>
            <p className="mt-1 text-sm text-gray-500">{date}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close receipt details"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-2xl leading-none text-gray-500 transition hover:bg-gray-800 hover:text-gray-200"
          >
            ×
          </button>
        </div>

        <AddToHomeSnapCard receipt={receipt} onDone={onClose} />
        <div className="mt-6 grid gap-6 md:grid-cols-2">
          {/* Original image */}
          {receipt.image_base64 ? (
            <img
              src={`data:image/jpeg;base64,${receipt.image_base64}`}
              alt="Original receipt"
              className="max-h-[32rem] w-full rounded-2xl border border-gray-800 bg-gray-900 object-contain"
            />
          ) : (
            <div className="grid max-h-[32rem] min-h-48 place-items-center rounded-2xl border border-dashed border-gray-800 text-sm text-gray-600">
              No saved image for this receipt.
            </div>
          )}

          {/* Extracted fields */}
          <div className="min-w-0">
            <dl className="grid gap-5">
              <Field label="Total" value={formatTotal(receipt.total, receipt.currency)} />
              {EXTRA_FIELDS.map(({ key, label }) => (
                <Field key={key} label={label} value={extra[key]} />
              ))}
              {HIGHLIGHT_FIELDS.map(({ key, label }) => {
                const values = Array.isArray(extra[key]) ? (extra[key] as unknown[]) : [];
                return <ChipList key={key} label={label} values={values} />;
              })}
              {otherFields.map(([key, value]) => (
                <Field key={key} label={key.replaceAll("_", " ")} value={value} />
              ))}
            </dl>

            {/* Line items */}
            <h3 className="mt-8 text-lg font-semibold">Items</h3>
            {items.length ? (
              <div className="mt-3 space-y-2">
                {items.map((item, i) => (
                  <ItemCard key={i} item={item} currency={receipt.currency} />
                ))}
              </div>
            ) : (
              <p className="mt-2 text-sm text-gray-600">No line items were extracted.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
