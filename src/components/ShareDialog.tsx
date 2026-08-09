import { useCallback, useEffect, useState } from "react";
import { useUser } from "@clerk/tanstack-start";
import { Link } from "@tanstack/react-router";
import type { CloudDocument } from "../cloudStorage";

interface ShareDialogProps {
  doc: CloudDocument;
  isPro: boolean;
  upgradeUrl: string;
  onClose: () => void;
}

interface CreatedLink {
  url: string;
  id: string;
  expiresAt: string | null;
  maxDownloads: number | null;
}

interface ManagedLink {
  id: string;
  documentId: string;
  url: string;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  createdAt: string;
  revoked: boolean;
  expired: boolean;
  reachedLimit: boolean;
}

const EXPIRY_OPTIONS = [
  { label: "24 hours", hours: 24 },
  { label: "7 days", hours: 168 },
  { label: "30 days", hours: 720 },
  { label: "Never", hours: 0 },
];

export function ShareDialog({ doc, isPro, upgradeUrl, onClose }: ShareDialogProps) {
  const { user } = useUser();
  const [tab, setTab] = useState<"create" | "manage">("create");

  // Create-link state
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [customHours, setCustomHours] = useState("");
  const [useCustom, setUseCustom] = useState(false);
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [downloadLimitEnabled, setDownloadLimitEnabled] = useState(false);
  const [downloadLimit, setDownloadLimit] = useState("");
  const [created, setCreated] = useState<CreatedLink | null>(null);
  const [copied, setCopied] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Manage state
  const [links, setLinks] = useState<ManagedLink[]>([]);
  const [loadingLinks, setLoadingLinks] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [manageError, setManageError] = useState<string | null>(null);

  const loadLinks = useCallback(async () => {
    if (!user?.id) return;
    setLoadingLinks(true);
    setManageError(null);
    try {
      const res = await fetch("/api/shares", {
        headers: { "x-clerk-user-id": user.id },
      });
      if (res.ok) {
        const body = (await res.json()) as { links: ManagedLink[] };
        setLinks(body.links);
      } else {
        setManageError("Couldn't load your share links.");
      }
    } catch {
      setManageError("Couldn't load your share links.");
    } finally {
      setLoadingLinks(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (tab === "manage") loadLinks();
  }, [tab, loadLinks]);

  async function createLink(e: React.FormEvent) {
    e.preventDefault();
    if (!user?.id) return;
    setCreating(true);
    setError(null);
    try {
      let expiresInHours: number | null = null;
      if (useCustom) {
        const h = Number(customHours);
        if (customHours.trim() && Number.isFinite(h) && h > 0) {
          expiresInHours = h;
        } else {
          setError("Enter a number of hours for the custom expiry.");
          setCreating(false);
          return;
        }
      } else {
        const opt = EXPIRY_OPTIONS[expiryIdx];
        expiresInHours = opt && opt.hours > 0 ? opt.hours : null;
      }
      let maxDownloads: number | null = null;
      if (downloadLimitEnabled) {
        const n = Number(downloadLimit);
        if (downloadLimit.trim() && Number.isFinite(n) && n > 0) {
          maxDownloads = Math.floor(n);
        } else {
          setError("Enter a number for the download limit.");
          setCreating(false);
          return;
        }
      }
      const res = await fetch("/api/share", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-clerk-user-id": user.id,
        },
        body: JSON.stringify({
          documentId: doc.id,
          password: passwordEnabled && password.trim() ? password.trim() : null,
          expiresInHours,
          maxDownloads,
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        url?: string;
        id?: string;
        expiresAt?: string | null;
        maxDownloads?: number | null;
        error?: string;
        message?: string;
      };
      if (!res.ok) {
        if (res.status === 403 && body.error === "pro_required") {
          setError("pro_required");
        } else {
          setError(body.error || body.message || "Couldn't create the share link.");
        }
        return;
      }
      setCreated({
        url: body.url!,
        id: body.id!,
        expiresAt: body.expiresAt ?? null,
        maxDownloads: body.maxDownloads ?? null,
      });
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setCreating(false);
    }
  }

  async function revokeLink(id: string) {
    if (!user?.id) return;
    setRevokingId(id);
    try {
      await fetch(`/api/share/${id}`, {
        method: "DELETE",
        headers: { "x-clerk-user-id": user.id },
      });
      setLinks((prev) => prev.filter((l) => l.id !== id));
    } catch {
      setManageError("Couldn't revoke that link.");
    } finally {
      setRevokingId(null);
    }
  }

  function copyLink() {
    if (!created) return;
    navigator.clipboard?.writeText(created.url).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  }

  function resetForm() {
    setCreated(null);
    setError(null);
    setPassword("");
    setCopied(false);
  }

  // ── Pro gate ───────────────────────────────────────────────────────
  if (!isPro) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={onClose}>
        <div
          className="w-full max-w-md rounded-2xl border border-gray-800 bg-gray-900 p-6 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-indigo-950 text-2xl">
              🔗
            </div>
            <h2 className="text-xl font-semibold text-white">Secure sharing</h2>
            <p className="mt-3 text-sm leading-relaxed text-gray-400">
              Secure sharing is a Pro feature — upgrade to share documents with
              expiring, password-protected links.
            </p>
            <div className="mt-6 flex flex-col gap-3">
              <Link
                to={upgradeUrl}
                className="rounded-lg bg-indigo-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-indigo-500"
              >
                Upgrade to Pro
              </Link>
              <button
                onClick={onClose}
                className="rounded-lg border border-gray-700 px-4 py-2.5 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-2xl border border-gray-800 bg-gray-900 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-800 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-white">Share document</h2>
            <p className="mt-0.5 max-w-xs truncate text-xs text-gray-500">{doc.name}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded p-1.5 text-gray-400 transition hover:bg-gray-800 hover:text-white"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-gray-800 px-4 pt-3">
          <button
            onClick={() => setTab("create")}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              tab === "create"
                ? "border-b-2 border-indigo-500 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Create link
          </button>
          <button
            onClick={() => setTab("manage")}
            className={`rounded-t-lg px-4 py-2 text-sm font-medium transition ${
              tab === "manage"
                ? "border-b-2 border-indigo-500 text-white"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Your links
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-5">
          {tab === "create" && (
            <form onSubmit={createLink} className="space-y-5">
              {created ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-emerald-800/60 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
                    ✅ Link created — anyone with it can open this document
                    {created.expiresAt &&
                      ` until ${new Date(created.expiresAt).toLocaleString()}`}
                    {created.maxDownloads &&
                      ` (max ${created.maxDownloads} downloads)`}
                    .
                  </div>
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">
                      Shareable URL
                    </label>
                    <div className="flex gap-2">
                      <input
                        readOnly
                        value={created.url}
                        onFocus={(e) => e.target.select()}
                        className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5 text-xs text-gray-200 outline-none"
                      />
                      <button
                        type="button"
                        onClick={copyLink}
                        className={`shrink-0 rounded-lg px-4 py-2.5 text-sm font-semibold transition ${
                          copied
                            ? "bg-emerald-600 text-white"
                            : "bg-indigo-600 text-white hover:bg-indigo-500"
                        }`}
                      >
                        {copied ? "Copied!" : "Copy link"}
                      </button>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={resetForm}
                    className="text-xs font-medium text-gray-400 underline-offset-2 transition hover:text-gray-200 hover:underline"
                  >
                    ← Create another link
                  </button>
                </div>
              ) : (
                <>
                  {error && error === "pro_required" ? (
                    <div className="rounded-xl border border-amber-800/60 bg-amber-950/30 px-4 py-4 text-center">
                      <p className="text-sm font-medium text-amber-300">
                        Secure sharing is a Pro feature — upgrade to share documents
                      </p>
                      <Link
                        to={upgradeUrl}
                        className="mt-3 inline-block rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-amber-500"
                      >
                        Upgrade to Pro
                      </Link>
                    </div>
                  ) : (
                    error && (
                      <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                        {error}
                      </div>
                    )
                  )}

                  {/* Expiration */}
                  <div>
                    <label className="mb-1.5 block text-xs font-medium text-gray-400">
                      Link expires
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {EXPIRY_OPTIONS.map((opt, i) => (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => {
                            setExpiryIdx(i);
                            setUseCustom(false);
                          }}
                          className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                            !useCustom && expiryIdx === i
                              ? "border-indigo-500 bg-indigo-600/20 text-indigo-300"
                              : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={() => setUseCustom(true)}
                        className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                          useCustom
                            ? "border-indigo-500 bg-indigo-600/20 text-indigo-300"
                            : "border-gray-700 text-gray-400 hover:border-gray-600 hover:text-gray-200"
                        }`}
                      >
                        Custom…
                      </button>
                    </div>
                    {useCustom && (
                      <input
                        type="number"
                        min={1}
                        value={customHours}
                        onChange={(e) => setCustomHours(e.target.value)}
                        placeholder="Hours"
                        className="mt-2 w-32 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>

                  {/* Password */}
                  <div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-300">
                      <input
                        type="checkbox"
                        checked={passwordEnabled}
                        onChange={(e) => setPasswordEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-600 bg-gray-800 accent-indigo-600"
                      />
                      Require a password
                    </label>
                    {passwordEnabled && (
                      <input
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        placeholder="Password (shared with recipients)"
                        className="mt-2 w-full rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>

                  {/* Download limit */}
                  <div>
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-gray-300">
                      <input
                        type="checkbox"
                        checked={downloadLimitEnabled}
                        onChange={(e) => setDownloadLimitEnabled(e.target.checked)}
                        className="h-4 w-4 rounded border-gray-600 bg-gray-800 accent-indigo-600"
                      />
                      Limit total downloads
                    </label>
                    {downloadLimitEnabled && (
                      <input
                        type="number"
                        min={1}
                        value={downloadLimit}
                        onChange={(e) => setDownloadLimit(e.target.value)}
                        placeholder="e.g. 5"
                        className="mt-2 w-32 rounded-lg border border-gray-700 bg-gray-950 px-3 py-2.5 text-sm text-white placeholder-gray-500 outline-none focus:border-indigo-500"
                      />
                    )}
                  </div>

                  <button
                    type="submit"
                    disabled={creating}
                    className="w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-50"
                  >
                    {creating ? "Creating…" : "Create share link"}
                  </button>
                </>
              )}
            </form>
          )}

          {tab === "manage" && (
            <div className="space-y-3">
              {manageError && (
                <div className="rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
                  {manageError}
                </div>
              )}
              {loadingLinks && (
                <div className="flex items-center justify-center py-10 text-gray-400">
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
                </div>
              )}
              {!loadingLinks && links.length === 0 && (
                <p className="py-10 text-center text-sm text-gray-500">
                  No active share links for this account.
                </p>
              )}
              {links.map((l) => (
                <div
                  key={l.id}
                  className="rounded-xl border border-gray-800 bg-gray-950/60 px-4 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-gray-300">
                        {l.documentId === doc.id
                          ? doc.name
                          : `Document ${l.documentId.slice(0, 8)}…`}
                      </p>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {l.revoked
                          ? "Revoked"
                          : l.expired
                            ? "Expired"
                            : l.reachedLimit
                              ? "Download limit reached"
                              : `Expires ${l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : "never"}`}
                        {l.maxDownloads != null &&
                          ` · ${l.downloadCount}/${l.maxDownloads} downloads`}
                        {l.maxDownloads == null &&
                          l.downloadCount > 0 &&
                          ` · ${l.downloadCount} downloads`}
                      </p>
                    </div>
                    <button
                      onClick={() => revokeLink(l.id)}
                      disabled={revokingId === l.id}
                      className="shrink-0 rounded-lg border border-red-900/60 px-3 py-1.5 text-xs font-medium text-red-400 transition hover:bg-red-950/50 disabled:opacity-50"
                    >
                      {revokingId === l.id ? "Revoking…" : "Revoke"}
                    </button>
                  </div>
                </div>
              ))}
              {links.length > 0 && (
                <button
                  onClick={loadLinks}
                  className="w-full text-center text-xs font-medium text-gray-400 transition hover:text-gray-200"
                >
                  Refresh
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
