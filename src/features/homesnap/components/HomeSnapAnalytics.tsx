/**
 * HomeSnap improvement-log analytics — spend-over-time dashboard and the
 * printable home-sale / insurance report.
 *
 * Pure presentation: it fetches the aggregate data via getHomeAnalytics /
 * getHomeReport (owner-scoped and addon-gated server-side, fails closed) and
 * renders loading/empty/error states honestly. The spend figures are computed
 * from the object purchase prices and cost-bearing timeline events the owner
 * already recorded — nothing here fabricates data.
 */
import { useCallback, useEffect, useState } from "react";
import { getHomeAnalytics, getHomeReport } from "../server";
import {
  EVENT_TYPE_LABELS,
  OBJECT_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  type AnalyticsData,
  type HomeReportData,
  type SpendYearBucket,
} from "../types";

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

const btnGhost =
  "rounded-full border border-gray-700 px-4 py-2 text-sm font-medium text-gray-200 transition hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-45";

function money(v: number | null): string {
  return v == null ? "" : `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

/** Dollar figure or "—" for null. */
function moneyOrDash(v: number | null): string {
  return v == null ? "—" : money(v);
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

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-xl border border-gray-800 bg-gray-950/40 p-4 print:border-gray-300">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500 print:text-gray-600">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-gray-100 print:text-black">{value}</p>
      {sub && <p className="mt-1 text-xs text-gray-500 print:text-gray-600">{sub}</p>}
    </div>
  );
}

/** Lightweight pure-CSS/SVG bar chart of spend by year (no chart library). */
function SpendYearChart({ byYear }: { byYear: SpendYearBucket[] }) {
  const max = Math.max(1, ...byYear.map((b) => b.total));
  if (byYear.length === 0) {
    return <p className="mt-2 text-sm text-gray-500">No spend recorded yet.</p>;
  }
  return (
    <div className="mt-4">
      <div className="flex items-end gap-3 overflow-x-auto pb-1" style={{ minHeight: "9.5rem" }}>
        {byYear.map((b) => {
          const oH = Math.max(3, (b.objectSpend / max) * 120);
          const eH = Math.max(3, (b.eventSpend / max) * 120);
          return (
            <div key={b.year} className="flex min-w-[3.25rem] flex-1 flex-col items-center gap-1">
              <span className="text-[10px] font-medium text-gray-400 print:text-gray-700">{money(b.total)}</span>
              <div className="flex w-full items-end justify-center gap-1">
                <div
                  className="w-3 rounded-t bg-indigo-500"
                  style={{ height: `${oH}px` }}
                  title={`Purchases ${money(b.objectSpend)}`}
                />
                <div
                  className="w-3 rounded-t bg-emerald-500"
                  style={{ height: `${eH}px` }}
                  title={`Repairs & service ${money(b.eventSpend)}`}
                />
              </div>
              <span className="text-xs text-gray-500 print:text-gray-700">{b.year}</span>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-gray-500 print:text-gray-700">
        <span className="mr-3 inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-indigo-500" /> Purchases
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" /> Repairs &amp; service
        </span>
      </p>
    </div>
  );
}

/**
 * The cross-home spend dashboard tab: totals, a by-year chart, a by-object-type
 * breakdown, and a period summary. Its "Home-sale / insurance report" action
 * opens the printable report view. Addon-gated server-side (fails closed).
 */
export function HomeSnapAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");
  const [showReport, setShowReport] = useState(false);

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await getHomeAnalytics();
      setData(res as AnalyticsData);
      setStatus("ready");
      setLoadError("");
    } catch (err) {
      setStatus("error");
      setLoadError(messageFromError(err, "Spend analytics could not be loaded."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (showReport) {
    return <HomeSnapReport onBack={() => setShowReport(false)} />;
  }

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold">Home spend analytics</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            Everything you've recorded spent on your home over time — the
            purchase prices of its systems, appliances, fixtures and
            improvements, plus the cost of repairs and services.
          </p>
        </div>
        <button type="button" onClick={() => setShowReport(true)} className={btnGhost}>
          🖨️ Home-sale / insurance report
        </button>
      </div>

      {status === "error" && (
        <div className="mt-4">
          <ErrorCard message={loadError} onRetry={() => void load()} />
        </div>
      )}

      {status === "loading" ? (
        <div className="mt-4 h-24 animate-pulse rounded-xl border border-gray-800 bg-gray-800/40" aria-label="Loading analytics" />
      ) : status === "ready" && data ? (
        <>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Total recorded spend" value={money(data.totalSpend)} />
            <StatCard label="Purchase spend" value={money(data.objectSpend)} sub="Systems, appliances, fixtures, improvements" />
            <StatCard
              label="Repairs &amp; service"
              value={money(data.eventSpend)}
              sub={data.eventCount === 1 ? "1 costed entry" : `${data.eventCount} costed entries`}
            />
            <StatCard label="Years on record" value={String(data.byYear.length)} />
          </div>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-200">Spend by year</h3>
            <SpendYearChart byYear={data.byYear} />
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            <div>
              <h3 className="text-sm font-semibold text-gray-200">By object type</h3>
              {data.byType.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">No purchase spend recorded yet.</p>
              ) : (
                <div className="mt-3 space-y-3">
                  {data.byType.map((t) => {
                    const pct = data.objectSpend > 0 ? Math.round((t.objectSpend / data.objectSpend) * 100) : 0;
                    return (
                      <div key={t.object_type}>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-300">
                            {OBJECT_TYPE_LABELS[t.object_type]}
                            <span className="text-gray-500">
                              {" "}· {t.count} {t.count === 1 ? "item" : "items"}
                            </span>
                          </span>
                          <span className="font-medium text-gray-200">
                            {money(t.objectSpend)} <span className="text-xs text-gray-500">({pct}%)</span>
                          </span>
                        </div>
                        <div className="mt-1 h-2 rounded-full bg-gray-800">
                          <div className="h-2 rounded-full bg-indigo-500" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div>
              <h3 className="text-sm font-semibold text-gray-200">Period summary</h3>
              {data.byYear.length === 0 ? (
                <p className="mt-2 text-sm text-gray-500">No spend recorded yet.</p>
              ) : (
                <div className="mt-3 space-y-2 text-sm text-gray-400">
                  <p>
                    <span className="text-gray-200">Recorded range:</span>{" "}
                    {data.byYear[0].year} – {data.byYear[data.byYear.length - 1].year}
                  </p>
                  <p>
                    <span className="text-gray-200">Biggest year:</span>{" "}
                    {data.byYear.reduce((a, b) => (b.total > a.total ? b : a)).year} (
                    {money(Math.max(...data.byYear.map((b) => b.total)))})
                  </p>
                  <p>
                    Spend is computed from what you've recorded. Add costs to
                    repair/service timeline entries and purchase prices to objects
                    to keep it accurate.
                  </p>
                </div>
              )}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}

/**
 * The printable home-sale / insurance report. Renders every recorded property,
 * object (type/date/cost/warranty/status) and cost-bearing repair/service
 * entry with running totals — a clean layout the owner can print or save as
 * PDF in-browser. Only what's recorded is shown; nothing is fabricated.
 */
export function HomeSnapReport({ onBack }: { onBack: () => void }) {
  const [report, setReport] = useState<HomeReportData | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");

  const load = useCallback(async () => {
    setStatus("loading");
    try {
      const res = await getHomeReport();
      setReport(res as HomeReportData);
      setStatus("ready");
      setLoadError("");
    } catch (err) {
      setStatus("error");
      setLoadError(messageFromError(err, "The report could not be generated."));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6 print:rounded-none print:border-0 print:bg-white print:text-black">
      <div className="flex flex-wrap items-start justify-between gap-3 print:hidden">
        <div>
          <h2 className="font-semibold">Home-sale / insurance report</h2>
          <p className="mt-1 max-w-xl text-sm text-gray-500">
            A clean summary of your home's recorded improvements and repairs for
            a buyer or insurer. Print it or save it as a PDF.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className={btnGhost}>← Back</button>
          <button
            type="button"
            onClick={() => window.print()}
            className="rounded-full bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
          >
            Print / Save as PDF
          </button>
        </div>
      </div>

      {status === "error" && (
        <div className="mt-4 print:hidden">
          <ErrorCard message={loadError} onRetry={() => void load()} />
        </div>
      )}
      {status === "loading" && (
        <div className="mt-4 h-24 animate-pulse rounded-xl border border-gray-800 bg-gray-800/40 print:hidden" aria-label="Loading report" />
      )}

      {status === "ready" && report && (
        <div className="mt-4">
          <h3 className="text-xl font-bold text-gray-100 print:text-black">Home improvements &amp; repairs report</h3>
          <p className="mt-1 text-sm text-gray-500 print:text-gray-600">
            Generated {new Date(report.generated_at).toLocaleString()} · from HomeSnap records
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <StatCard label="Total recorded spend" value={money(report.totalSpend)} />
            <StatCard label="Purchases" value={money(report.objectSpend)} sub="Objects at purchase price" />
            <StatCard
              label="Repairs &amp; service"
              value={money(report.eventSpend)}
              sub={`${report.events.length} costed entries`}
            />
          </div>

          {report.properties.map((p) => {
            const pObjs = report.objects.filter((o) => o.property_id === p.id);
            return (
              <div key={p.id} className="mt-6">
                <h4 className="text-base font-semibold text-gray-100 print:text-black">
                  {p.nickname}
                  <span className="ml-2 text-sm font-normal text-gray-500 print:text-gray-700">
                    ({PROPERTY_TYPE_LABELS[p.property_type]})
                  </span>
                </h4>
                {(p.purchase_date || p.purchase_price != null) && (
                  <p className="text-xs text-gray-500 print:text-gray-600">
                    {p.purchase_date ? `Purchased ${p.purchase_date}` : ""}
                    {p.purchase_price != null ? ` · ${money(p.purchase_price)}` : ""}
                  </p>
                )}
                {pObjs.length === 0 ? (
                  <p className="mt-2 text-sm text-gray-500">No objects recorded for this home.</p>
                ) : (
                  <table className="mt-3 w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-800 text-xs uppercase tracking-wide text-gray-500 print:border-gray-400 print:text-gray-600">
                        <th className="py-2 pr-3">Item</th>
                        <th className="py-2 pr-3">Type</th>
                        <th className="py-2 pr-3">Date</th>
                        <th className="py-2 pr-3">Cost</th>
                        <th className="py-2 pr-3">Warranty</th>
                        <th className="py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pObjs.map((o) => (
                        <tr key={o.id} className="border-b border-gray-900 print:border-gray-300">
                          <td className="py-2 pr-3 font-medium text-gray-100 print:text-black">{o.name}</td>
                          <td className="py-2 pr-3 text-gray-400 print:text-gray-700">{OBJECT_TYPE_LABELS[o.object_type]}</td>
                          <td className="py-2 pr-3 text-gray-400 print:text-gray-700">{o.purchase_date ?? o.installation_date ?? "—"}</td>
                          <td className="py-2 pr-3 text-emerald-300 print:text-black">
                            {moneyOrDash(o.purchase_price)}
                            {o.event_spend > 0 ? ` +${money(o.event_spend)}` : ""}
                          </td>
                          <td className="py-2 pr-3 text-gray-400 print:text-gray-700">{o.warranty_expiration ?? "—"}</td>
                          <td className="py-2 text-gray-400 print:text-gray-700">{o.status === "retired" ? "Retired" : "Active"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            );
          })}

          {report.events.length > 0 && (
            <div className="mt-6">
              <h4 className="text-base font-semibold text-gray-100 print:text-black">Repairs &amp; service history</h4>
              <table className="mt-3 w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-800 text-xs uppercase tracking-wide text-gray-500 print:border-gray-400 print:text-gray-600">
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3">Item</th>
                    <th className="py-2 pr-3">Work</th>
                    <th className="py-2">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {report.events.map((e) => (
                    <tr key={e.id} className="border-b border-gray-900 print:border-gray-300">
                      <td className="py-2 pr-3 text-gray-400 print:text-gray-700">{e.occurred_on ?? "—"}</td>
                      <td className="py-2 pr-3 font-medium text-gray-100 print:text-black">{e.object_name}</td>
                      <td className="py-2 pr-3 text-gray-400 print:text-gray-700">
                        {e.title || EVENT_TYPE_LABELS[e.event_type]}
                      </td>
                      <td className="py-2 text-emerald-300 print:text-black">{moneyOrDash(e.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {report.events.length === 0 && report.objects.every((o) => o.purchase_price == null) && (
            <p className="mt-6 text-sm text-gray-500 print:text-gray-700">
              No improvements or repairs with costs recorded yet to include in a report.
            </p>
          )}

          <p className="mt-8 text-xs text-gray-500 print:text-gray-600">
            This report reflects only what you've recorded in HomeSnap, and does
            not include the purchase price of the home itself.
          </p>
        </div>
      )}
    </section>
  );
}
