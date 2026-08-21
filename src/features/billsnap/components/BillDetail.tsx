/**
 * BillSnap — bill detail modal.
 *
 * Shows every extracted field (all editable in Edit mode), a worked change
 * detection card against the user's own bill series, a reminder setter (on
 * due date or 1/3/7 days before), and Pay / Archive actions. Mirrors the
 * ReceiptSnap detail modal's dark gray/indigo treatment.
 */
import { useEffect, useState } from "react";
import {
  type Bill,
  type BillStatus,
  BILL_CATEGORIES,
  formatAmount,
  maskAccount,
} from "../types";
import { setReminder, setStatus, updateBill } from "../server";
import { changeLabel, detectChange } from "../changeDetection";

const STATUS_STYLES: Record<BillStatus, string> = {
  Upcoming: "bg-gray-800 text-gray-300",
  "Due Soon": "bg-amber-900/40 text-amber-300",
  Overdue: "bg-red-900/40 text-red-300",
  Paid: "bg-emerald-900/40 text-emerald-300",
  Archived: "bg-gray-800/60 text-gray-500",
};

function Notice({ children }: { children: string }) {
  if (!children) return null;
  return (
    <p role="status" className="mt-3 text-center text-sm text-indigo-300">
      {children}
    </p>
  );
}

export function BillDetailModal({
  bill,
  all,
  onClose,
  onChanged,
}: {
  bill: Bill;
  all: Bill[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  // Edit form state (strings so empty fields round-trip cleanly).
  const [vendor, setVendor] = useState(bill.vendor ?? "");
  const [category, setCategory] = useState(bill.category ?? "");
  const [accountRef, setAccountRef] = useState(bill.account_reference ?? "");
  const [statementDate, setStatementDate] = useState(bill.statement_date ?? "");
  const [dueDate, setDueDate] = useState(bill.due_date ?? "");
  const [amountDue, setAmountDue] = useState(
    bill.amount_due == null ? "" : String(bill.amount_due),
  );
  const [minPayment, setMinPayment] = useState(
    bill.minimum_payment == null ? "" : String(bill.minimum_payment),
  );
  const [billingPeriod, setBillingPeriod] = useState(bill.billing_period ?? "");

  useEffect(() => {
    setEditing(false);
    setNotice("");
    setError("");
    setVendor(bill.vendor ?? "");
    setCategory(bill.category ?? "");
    setAccountRef(bill.account_reference ?? "");
    setStatementDate(bill.statement_date ?? "");
    setDueDate(bill.due_date ?? "");
    setAmountDue(bill.amount_due == null ? "" : String(bill.amount_due));
    setMinPayment(
      bill.minimum_payment == null ? "" : String(bill.minimum_payment),
    );
    setBillingPeriod(bill.billing_period ?? "");
  }, [bill]);

  const signal = detectChange(bill, all);

  async function saveEdit() {
    if (!vendor.trim()) {
      setError("Vendor is required.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await updateBill({
        data: {
          id: bill.id,
          fields: {
            vendor,
            category,
            account_reference: accountRef,
            statement_date: statementDate,
            due_date: dueDate,
            amount_due: amountDue,
            minimum_payment: minPayment,
            billing_period: billingPeriod,
            autopay_status: bill.autopay_status,
            confidence_score: bill.confidence_score,
          },
        },
      });
      setEditing(false);
      setNotice("Bill updated.");
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update this bill.");
    } finally {
      setBusy(false);
    }
  }

  async function changeStatus(status: "Paid" | "Archived" | "Upcoming") {
    setBusy(true);
    setError("");
    try {
      await setStatus({ data: { id: bill.id, status } });
      setNotice(
        status === "Paid"
          ? "Marked as paid."
          : status === "Archived"
            ? "Archived."
            : "Reopened as upcoming.",
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update status.");
    } finally {
      setBusy(false);
    }
  }

  async function saveReminder(leadDays: number) {
    setBusy(true);
    setError("");
    try {
      await setReminder({ data: { id: bill.id, leadDays } });
      setNotice(
        leadDays === 0
          ? "Reminder set for the due date."
          : `Reminder set ${leadDays} day${leadDays === 1 ? "" : "s"} before the due date.`,
      );
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't set the reminder.");
    } finally {
      setBusy(false);
    }
  }

  const leadChoices = [0, 1, 3, 7];

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8">
      <div className="w-full max-w-2xl rounded-2xl border border-gray-800 bg-gray-950 p-6 shadow-2xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-indigo-400">
              Bill detail
            </p>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <h2 className="text-2xl font-bold">{bill.vendor || "Unnamed bill"}</h2>
              <span
                className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_STYLES[bill.status]}`}
              >
                {bill.status}
              </span>
            </div>
            <p className="mt-1 text-sm text-gray-500">
              {bill.billing_period || "No billing period"} · acct {maskAccount(bill.account_reference)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-gray-500 transition hover:bg-gray-800 hover:text-gray-200"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Headline amount + change detection card */}
        <div className="mt-5 rounded-2xl border border-indigo-900/60 bg-indigo-950/30 p-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="text-xs text-gray-400">Amount due</p>
              <p className="mt-1 text-3xl font-bold text-white">
                {formatAmount(bill.amount_due)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-gray-400">Due date</p>
              <p className="mt-1 text-lg font-semibold text-indigo-200">
                {bill.due_date || "—"}
              </p>
            </div>
          </div>
          {signal ? (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-amber-900/60 bg-amber-950/30 px-4 py-3 text-sm">
              <span aria-hidden="true" className="text-lg">📈</span>
              <p className="text-amber-100">
                <span className="font-semibold text-white">{bill.vendor}</span>{" "}
                {changeLabel(signal)} — was{" "}
                <span className="font-semibold">{formatAmount(signal.previous.amount_due)}</span>{" "}
                ({signal.previous.billing_period || signal.previous.statement_date}).
              </p>
            </div>
          ) : (
            <p className="mt-4 text-xs text-gray-500">
              Add an earlier {bill.vendor ? `${bill.vendor} ` : ""}bill to see
              change detection across the series.
            </p>
          )}
        </div>

        {/* Fields (all editable) */}
        <div className="mt-5 space-y-3">
          {editing ? (
            <>
              {[
                { label: "Vendor", val: vendor, set: setVendor, type: "text" },
                { label: "Account reference", val: accountRef, set: setAccountRef, type: "text" },
                { label: "Statement date", val: statementDate, set: setStatementDate, type: "text" },
                { label: "Due date", val: dueDate, set: setDueDate, type: "text" },
                { label: "Amount due", val: amountDue, set: setAmountDue, type: "number" },
                { label: "Minimum payment", val: minPayment, set: setMinPayment, type: "number" },
                { label: "Billing period", val: billingPeriod, set: setBillingPeriod, type: "text" },
              ].map((f) => (
                <label key={f.label} className="block">
                  <span className="text-xs font-medium text-gray-400">{f.label}</span>
                  <input
                    type={f.type}
                    value={f.val}
                    onChange={(e) => f.set(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                </label>
              ))}
              <label className="block">
                <span className="text-xs font-medium text-gray-400">Category</span>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
                >
                  <option value="">—</option>
                  {BILL_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-medium text-gray-400">
                  Autopay status (read from bill)
                </span>
                <p className="mt-1 text-sm text-gray-400">{bill.autopay_status}</p>
              </label>
            </>
          ) : (
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              {[
                ["Vendor", bill.vendor],
                ["Category", bill.category],
                ["Account reference", maskAccount(bill.account_reference)],
                ["Statement date", bill.statement_date],
                ["Due date", bill.due_date],
                ["Amount due", formatAmount(bill.amount_due)],
                ["Minimum payment", formatAmount(bill.minimum_payment)],
                ["Billing period", bill.billing_period],
                ["Autopay", bill.autopay_status],
                [
                  "Confidence",
                  bill.confidence_score == null ? "—" : `${(bill.confidence_score * 100).toFixed(0)}%`,
                ],
              ].map(([label, val]) => (
                <div key={String(label)} className="rounded-xl border border-gray-800 bg-gray-900/60 px-3 py-2">
                  <dt className="text-xs text-gray-500">{label}</dt>
                  <dd className="mt-0.5 font-medium text-gray-200">{val || "—"}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>

        {error && <p role="alert" className="mt-3 text-sm text-red-400">{error}</p>}
        <Notice>{notice}</Notice>

        {/* Reminder */}
        {!editing && (
          <div className="mt-5 rounded-2xl border border-gray-800 bg-gray-900/60 p-4">
            <p className="text-sm font-semibold">Reminder</p>
            <p className="mt-1 text-xs text-gray-500">
              {bill.reminder_lead_days == null
                ? "No reminder set."
                : bill.reminder_lead_days === 0
                  ? "Reminds you on the due date."
                  : `Reminds you ${bill.reminder_lead_days} day${bill.reminder_lead_days === 1 ? "" : "s"} before the due date.`}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {leadChoices.map((d) => (
                <button
                  key={d}
                  type="button"
                  disabled={busy}
                  onClick={() => void saveReminder(d)}
                  className={`rounded-full px-3 py-1.5 text-xs font-semibold transition disabled:opacity-45 ${
                    bill.reminder_lead_days === d
                      ? "bg-indigo-600 text-white"
                      : "border border-gray-700 text-gray-300 hover:border-indigo-500"
                  }`}
                >
                  {d === 0 ? "On due date" : `${d}d before`}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex flex-wrap justify-between gap-3">
          {editing ? (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                  className="rounded-full border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 transition hover:border-gray-500"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void saveEdit()}
                  className="rounded-full bg-indigo-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-45"
                >
                  {busy ? "Saving…" : "Save changes"}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className="rounded-full border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 transition hover:border-indigo-500 hover:text-white"
                >
                  Edit
                </button>
                {bill.status !== "Paid" && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void changeStatus("Paid")}
                    className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-emerald-500 disabled:opacity-45"
                  >
                    Mark paid
                  </button>
                )}
                {bill.status === "Archived" ? (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void changeStatus("Upcoming")}
                    className="rounded-full border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 transition hover:border-indigo-500"
                  >
                    Restore
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void changeStatus("Archived")}
                    className="rounded-full border border-gray-700 px-4 py-2 text-sm font-semibold text-gray-300 transition hover:border-amber-500 hover:text-amber-200 disabled:opacity-45"
                  >
                    Archive
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
