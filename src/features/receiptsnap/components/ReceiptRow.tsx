import { type ReceiptSummary, displayDate, formatTotal } from "../types";

interface ReceiptRowProps {
  receipt: ReceiptSummary;
  onOpen: (receipt: ReceiptSummary) => void;
}

/**
 * A single receipt row in the library list: merchant, date, and total.
 * The whole row is a button that opens the detail modal.
 */
export function ReceiptRow({ receipt, onOpen }: ReceiptRowProps) {
  return (
    <button
      type="button"
      onClick={() => onOpen(receipt)}
      className="group flex w-full items-center justify-between gap-4 rounded-2xl border border-gray-800 bg-gray-900/60 p-5 text-left transition hover:border-indigo-500/60 hover:bg-gray-900"
    >
      <span className="min-w-0">
        <strong className="block truncate text-base font-semibold text-gray-100 transition group-hover:text-white">
          {receipt.merchant || "Unknown merchant"}
        </strong>
        <span className="mt-0.5 block text-sm text-gray-500">
          {displayDate(receipt.store_date)}
        </span>
      </span>
      <span className="shrink-0 font-semibold text-indigo-300">
        {formatTotal(receipt.total, receipt.currency)}
      </span>
    </button>
  );
}
