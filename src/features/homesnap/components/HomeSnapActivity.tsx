/**
 * HomeSnap household activity log — a per-property change history showing who
 * did what and when (the natural completion of household sharing).
 *
 * Pure presentation: it fetches recent activity via listActivity (addon-gated
 * and scoped through the SAME owner-or-share access boundary as every other
 * HomeSnap read, so only the owner and shared members can see it) and renders
 * loading/empty/error states honestly. Recording happens SERVER-SIDE on every
 * HomeSnap write action — this view is read-only.
 *
 * The view is filterable to a property (dropdown) and optionally to a single
 * object within that property (also a dropdown). Both default to the currently
 * selected property/object from the home view.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { listActivity, listObjects } from "../server";
import {
  ACTIVITY_ACTION_LABELS,
  ACTIVITY_ENTITY_LABELS,
  type Property,
  type PropertyActivity,
  type PropertyObject,
} from "../types";

function messageFromError(error: unknown, fallback: string): string {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
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

/** Color badge per activity verb — keeps the list scannable at a glance. */
const ACTION_BADGE: Record<string, string> = {
  created: "bg-emerald-900/40 text-emerald-300",
  updated: "bg-sky-900/40 text-sky-300",
  deleted: "bg-red-900/40 text-red-300",
  completed: "bg-violet-900/40 text-violet-300",
  shared: "bg-amber-900/40 text-amber-300",
  revoked: "bg-gray-800 text-gray-400",
};

/** A compact, human-friendly timestamp (e.g. "Aug 22, 4:15 PM"). */
function formatTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function HomeSnapActivity({
  properties,
  defaultPropertyId,
  defaultObjectId,
  currentUserId,
}: {
  properties: Property[];
  /** Property to show first (the one selected in the home view). */
  defaultPropertyId: number | null;
  /** Object to pre-filter to (the one selected in the home view). */
  defaultObjectId: number | null;
  /** The signed-in user, so "You" can stand in for their own entries. */
  currentUserId: string | null;
}) {
  const [propertyId, setPropertyId] = useState<number | null>(
    defaultPropertyId ?? properties[0]?.id ?? null,
  );
  const [objectFilter, setObjectFilter] = useState<number | null>(defaultObjectId ?? null);
  const [objects, setObjects] = useState<PropertyObject[]>([]);
  const [activities, setActivities] = useState<PropertyActivity[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState("");

  // When the property changes, load its objects for the object filter dropdown
  // and clear any object filter no longer in scope.
  const propertyIdKey = propertyId ?? "";
  useEffect(() => {
    if (!propertyId) {
      setObjects([]);
      setObjectFilter(null);
      return;
    }
    let cancelled = false;
    setObjectFilter(null);
    listObjects({ data: { property_id: propertyId } })
      .then((res) => {
        if (!cancelled) setObjects((res.objects as PropertyObject[]) ?? []);
      })
      .catch(() => {
        if (!cancelled) setObjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [propertyIdKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const load = useCallback(async () => {
    if (!propertyId) {
      setStatus("ready");
      setActivities([]);
      return;
    }
    setStatus("loading");
    try {
      const res = await listActivity({
        data: { property_id: propertyId, object_id: objectFilter },
      });
      setActivities((res.activities as PropertyActivity[]) ?? []);
      setStatus("ready");
      setLoadError("");
    } catch (err) {
      setStatus("error");
      setLoadError(messageFromError(err, "The activity log couldn't be loaded."));
    }
  }, [propertyId, objectFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedProperty = useMemo(
    () => properties.find((p) => p.id === propertyId) ?? null,
    [properties, propertyId],
  );

  return (
    <section className="rounded-2xl border border-gray-800 bg-gray-900/60 p-5 sm:p-6">
      <div>
        <h2 className="font-semibold">Activity</h2>
        <p className="mt-1 max-w-xl text-sm text-gray-500">
          Who changed what in this home and when — a running log of every object,
          document, maintenance task, and sharing change. Recorded automatically;
          this view is read-only.
        </p>
      </div>

      {properties.length > 0 && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="min-w-52 flex-1">
            <span className="mb-1 block text-xs font-medium text-gray-400">Property</span>
            <select
              className={inputCls}
              value={propertyId ?? ""}
              onChange={(e) => setPropertyId(Number(e.target.value))}
            >
              {properties.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nickname}
                </option>
              ))}
            </select>
          </label>
          <label className="min-w-52 flex-1">
            <span className="mb-1 block text-xs font-medium text-gray-400">
              Object <span className="font-normal text-gray-600">(all objects)</span>
            </span>
            <select
              className={inputCls}
              value={objectFilter ?? ""}
              onChange={(e) => setObjectFilter(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">All objects</option>
              {objects.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {status === "error" && (
        <div className="mt-4">
          <ErrorCard message={loadError} onRetry={() => void load()} />
        </div>
      )}

      {status === "loading" ? (
        <div className="mt-4 h-24 animate-pulse rounded-xl border border-gray-800 bg-gray-800/40" aria-label="Loading activity" />
      ) : status === "ready" && activities.length ? (
        <ul className="mt-4 divide-y divide-gray-800/70">
          {activities.map((a) => {
            const isYou = currentUserId != null && a.actor_user_id === currentUserId;
            return (
              <li key={a.id} className="py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      ACTION_BADGE[a.action] ?? "bg-gray-800 text-gray-300"
                    }`}
                  >
                    {ACTIVITY_ACTION_LABELS[a.action]}
                  </span>
                  <span className="rounded-full bg-gray-800 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    {ACTIVITY_ENTITY_LABELS[a.entity_type]}
                  </span>
                  <span className="text-xs text-gray-500">{formatTime(a.created_at)}</span>
                </div>
                <p className="mt-1 text-sm text-gray-200">
                  {a.message ?? "Made a change to this home."}
                </p>
                <p className="mt-0.5 text-xs text-gray-500">
                  {isYou ? "You" : (a.actor_email ?? "A household member")} ·{" "}
                  {selectedProperty?.nickname ?? `Property #${a.property_id}`}
                </p>
              </li>
            );
          })}
        </ul>
      ) : status === "ready" ? (
        <div className="mt-4">
          <EmptyState
            icon="🕘"
            title={properties.length ? "No activity recorded yet" : "Add a property to get started"}
            body={
              properties.length
                ? selectedProperty
                  ? "Changes to this property will appear here as you (or someone you share it with) make them."
                  : "Changes to your homes will appear here as you make them."
                : "Add a home first — its activity log will show every change from then on."
            }
          />
        </div>
      ) : null}
    </section>
  );
}
