/**
 * BillSnap change-detection helpers.
 *
 * The headline smart feature: across a saved series of bills from the same
 * vendor, spot how this bill's amount compares to the previous one — e.g.
 * "Electric bill increased 31% from last month." Computed purely from the
 * user's own saved bills (never fabricated).
 */
import { type Bill } from "./types";

export interface ChangeSignal {
  /** The earlier bill this bill is compared against. */
  previous: Bill;
  /** Signed dollar delta: current − previous. */
  delta: number;
  /** Signed percentage delta, e.g. 31 for +31%. */
  percent: number;
  /** True when the amount went up. */
  increased: boolean;
}

/**
 * Returns the change signal for `bill` against the most recent prior bill from
 * the same vendor (by statement_date), or null when there is no prior bill or
 * both amounts are missing. Only like-for-like vendors are compared.
 */
export function detectChange(bill: Bill, all: Bill[]): ChangeSignal | null {
  if (bill.amount_due == null) return null;
  const prior = all
    .filter(
      (b) =>
        b.id !== bill.id &&
        b.vendor === bill.vendor &&
        b.statement_date != null &&
        bill.statement_date != null &&
        String(b.statement_date) < String(bill.statement_date),
    )
    .sort((a, b) =>
      String(b.statement_date).localeCompare(String(a.statement_date)),
    )[0];
  if (!prior || prior.amount_due == null) return null;
  const delta = bill.amount_due - prior.amount_due;
  const percent = prior.amount_due === 0 ? 0 : (delta / prior.amount_due) * 100;
  return { previous: prior, delta, percent, increased: delta > 0.005 };
}

/** Human text for a change signal, e.g. "increased 31% from last month". */
export function changeLabel(signal: ChangeSignal): string {
  const pct = `${Math.abs(signal.percent).toFixed(0)}%`;
  if (Math.abs(signal.delta) < 0.005) return "unchanged from last month";
  if (signal.increased) return `increased ${pct} from last month`;
  return `decreased ${pct} from last month`;
}
