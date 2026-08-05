import { Link } from "@tanstack/react-router";
import type { ErrorComponentProps } from "@tanstack/react-router";
import { useEffect } from "react";

import { logError } from "~/lib/errorLogger";

/**
 * Branded error boundary for unhandled route render errors.
 *
 * Rendered by the root route's `errorComponent` whenever an error bubbles up
 * through the router (any page). Replaces the whole document shell, so it
 * carries a few critical inline styles (background, centering) in case the app
 * stylesheet isn't present in that edge case, and relies on Tailwind for the
 * rest of the polish.
 */
export function RouteErrorBoundary({ error, reset }: ErrorComponentProps) {
  useEffect(() => {
    logError(error, "route-error");
  }, [error]);

  const handleTryAgain = () => {
    // reset() clears the boundary so the route re-renders in place; the reload
    // is a hard fallback that guarantees a fresh attempt either way.
    reset();
    window.location.reload();
  };

  return (
    <div
      style={{ minHeight: "100vh", backgroundColor: "#030712", color: "#fff" }}
      className="flex flex-col items-center justify-center gap-6 px-6 py-12 text-center animate-fade-in"
    >
      {/* Critical styles for the edge case where the app stylesheet is absent */}
      <style>{`html,body{margin:0;background:#030712}`}</style>

      {/* DocSnap © 2026 logo */}
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-600/25">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-9 w-9"
          fill="none"
          viewBox="0 0 64 64"
          aria-hidden="true"
        >
          <path
            d="M17 16v32M17 16h16c7.18 0 13 5.82 13 13v6c0 7.18-5.82 13-13 13H17"
            stroke="#fff"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            d="M46 20l-6 12 6 12"
            stroke="#a5b4fc"
            strokeWidth="3.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>

      <h1 className="text-2xl font-bold tracking-tight">DocSnap © 2026</h1>

      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-900/50">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className="h-8 w-8 text-red-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z"
          />
        </svg>
      </div>

      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Something went wrong</h2>
        <p className="mx-auto max-w-sm text-sm leading-relaxed text-gray-400">
          An unexpected error occurred while loading this page. Your scans and
          settings are safe — try again, or head back to the home page.
        </p>
      </div>

      <div className="flex flex-col items-center gap-3 sm:flex-row">
        <button
          onClick={handleTryAgain}
          className="rounded-full bg-indigo-600 px-8 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-600/30 transition hover:bg-indigo-500 active:scale-95"
        >
          Try again
        </button>
        <Link
          to="/"
          className="rounded-full border border-gray-700 px-8 py-3 text-sm font-semibold text-gray-200 transition hover:border-gray-500 hover:bg-gray-900 active:scale-95"
        >
          Go home
        </Link>
      </div>

      {import.meta.env.DEV && error instanceof Error && (
        <details className="w-full max-w-md rounded-xl border border-gray-800 bg-gray-900/60 p-4 text-left">
          <summary className="cursor-pointer text-sm font-medium text-gray-300">
            Error details (dev only)
          </summary>
          <pre className="mt-3 max-h-48 overflow-auto whitespace-pre-wrap break-words font-mono text-xs text-gray-400">
            {error.message}
            {"\n\n"}
            {error.stack}
          </pre>
        </details>
      )}
    </div>
  );
}
