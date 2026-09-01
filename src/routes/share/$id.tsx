import { useState, useEffect } from "react";
import { createFileRoute, Link, useParams } from "@tanstack/react-router";

export const Route = createFileRoute("/share/$id")({
  head: () => ({
    meta: [
      { title: "Shared document — DocSnap" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SharedDocumentView,
});

interface SharePayload {
  id: string;
  name: string;
  pageCount: number;
  fileUrl: string;
  fileKey: string;
  date: string;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  createdAt: string;
  revoked: boolean;
}

function SharedDocumentView() {
  const { id } = useParams({ from: "/share/$id" });
  const [data, setData] = useState<SharePayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [needsPassword, setNeedsPassword] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function fetchShare(pw?: string) {
    setLoading(true);
    setError(null);
    setNeedsPassword(false);
    try {
      const res = await fetch(`/api/share/${id}`, {
        headers: pw
          ? { Authorization: `Basic ${btoa(`share:${pw}`)}` }
          : undefined,
      });
      if (res.ok) {
        setData((await res.json()) as SharePayload);
        setPassword("");
      } else if (res.status === 401) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        if (body.error === "password_required") {
          setNeedsPassword(true);
        } else {
          setError("Incorrect password. Please try again.");
          setNeedsPassword(true);
        }
      } else if (res.status === 404) {
        setNotFound("This share link doesn't exist.");
      } else {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        setNotFound(body.error || "This share link is no longer available.");
      }
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchShare();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  async function submitPassword(e: React.FormEvent) {
    e.preventDefault();
    await fetchShare(password.trim());
  }

  return (
    <main className="flex min-h-screen flex-col bg-gray-950 text-white">
      <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6">
        {/* Back link */}
        <Link
          to="/"
          className="mb-6 inline-flex items-center gap-2 text-sm text-gray-400 transition hover:text-white"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          docsnapapp.com
        </Link>

        <div className="rounded-2xl border border-gray-800 bg-gray-900/60 p-6 sm:p-8">
          <div className="mb-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-indigo-400">
                Shared document
              </p>
              <h1 className="mt-1 text-xl font-semibold text-white sm:text-2xl">
                {data?.name ?? "Document"}
              </h1>
            </div>
            {data && (
              <span className="shrink-0 rounded-full border border-gray-700 bg-gray-800/80 px-3 py-1 text-xs text-gray-300">
                {data.pageCount} {data.pageCount === 1 ? "page" : "pages"}
              </span>
            )}
          </div>

          {loading && (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-indigo-400 border-t-transparent" />
              <p className="mt-4 text-sm">Loading document…</p>
            </div>
          )}

          {notFound && (
            <div className="py-16 text-center">
              <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-gray-800 text-2xl">
                🔒
              </div>
              <h2 className="text-lg font-semibold text-white">Link unavailable</h2>
              <p className="mx-auto mt-2 max-w-sm text-sm text-gray-400">{notFound}</p>
            </div>
          )}

          {error && !notFound && (
            <div className="mb-4 rounded-lg border border-red-900/60 bg-red-950/40 px-4 py-3 text-sm text-red-300">
              {error}
            </div>
          )}

          {needsPassword && !notFound && (
            <form onSubmit={submitPassword} className="py-8">
              <div className="mx-auto max-w-sm text-center">
                <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-950 text-xl">
                  🔑
                </div>
                <h2 className="text-lg font-semibold text-white">Password required</h2>
                <p className="mt-1 text-sm text-gray-400">
                  The owner protected this document with a password.
                </p>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  autoFocus
                  className="mt-5 w-full rounded-lg border border-gray-700 bg-gray-900 px-4 py-2.5 text-sm text-white placeholder-gray-500 outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/30"
                />
                <button
                  type="submit"
                  className="mt-4 w-full rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500"
                >
                  Unlock document
                </button>
              </div>
            </form>
          )}

          {data && !loading && (
            <>
              {/* PDF preview */}
              <div className="overflow-hidden rounded-xl border border-gray-800 bg-gray-950">
                <object
                  data={`${data.fileUrl}#toolbar=1`}
                  type="application/pdf"
                  className="h-[60vh] w-full"
                  aria-label={`Preview of ${data.name}`}
                >
                  <div className="flex h-64 flex-col items-center justify-center gap-3 text-gray-400">
                    <p className="text-sm">Preview not available in this browser.</p>
                    <a
                      href={data.fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm font-medium text-indigo-400 underline"
                    >
                      Open PDF directly
                    </a>
                  </div>
                </object>
              </div>

              {/* Actions */}
              <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
                <a
                  href={data.fileUrl}
                  download={data.name}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-500 sm:w-auto"
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="h-4 w-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Download PDF
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(data.fileUrl).then(
                      () => setCopied(true),
                      () => {},
                    );
                  }}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-gray-700 bg-gray-900 px-5 py-3 text-sm font-medium text-gray-200 transition hover:bg-gray-800 sm:w-auto"
                >
                  {copied ? "Copied!" : "Copy direct PDF link"}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
