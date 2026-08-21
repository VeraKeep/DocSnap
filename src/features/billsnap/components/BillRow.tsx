/**
 * BillSnap — compact bill row for the Track list.
 */
import { type Bill, type BillStatus, formatAmount, maskAccount } from "../types";

const STATUS_STYLES: Record<BillStatus, string> = {
  Upcoming: "bg-gray-800 text-gray-300",
  "Due Soon": "bg-amber-900/40 text-amber-300",
  Overdue: "bg-red-900/40 text-red-300",
  Paid: "bg-emerald-900/40 text-emerald-300",
  Archived: "bg-gray-800/60 text-gray-500",
};

export function BillRow({
  bill,
  onOpen,
}: {
  bill: Bill;
  onOpen: (bill: Bill) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(bill)}
      className="w-full rounded-2xl border border-gray-800 bg-gray-900/60 p-4 text-left transition hover:border-indigo-500/60"
    >
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="truncate font-semibold text-gray-100">
            {bill.vendor || "Unnamed bill"}
          </p>
          <p className="mt-0.5 truncate text-xs text-gray-500">
            {bill.category || "No category"} · acct {maskAccount(bill.account_reference)} · due{" "}
            {bill.due_date || "—"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="text-right">
            <span className="block text-base font-bold text-white">
              {formatAmount(bill.amount_due)}
            </span>
            <span
              className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_STYLES[bill.status]}`}
            >
              {bill.status}
            </span>
          </span>
        </div>
      </div>
    </button>
  );
}
