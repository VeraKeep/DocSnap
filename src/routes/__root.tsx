import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { ClerkProvider } from "@clerk/tanstack-start";
import { useEffect, type ReactNode } from "react";

import { RouteErrorBoundary } from "~/components/RouteErrorBoundary";
import { PwaRuntime } from "~/components/PwaRuntime";
import { installGlobalErrorHandlers } from "~/lib/errorLogger";
import appCss from "~/styles/app.css?url";

// import.meta.env (not process.env): Vite replaces the whole `process.env`
// object with {} in the client bundle, so a process.env read here would never
// reach the browser. NEXT_PUBLIC_ (and VITE_) vars are exposed to import.meta.env
// via envPrefix in vite.config.ts and inlined into both the SSR and client builds.
// These are PUBLIC values only — never read a secret via import.meta.env.
const clerkPubKey = import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const plausibleDomain = import.meta.env.NEXT_PUBLIC_PLAUSIBLE_DOMAIN ?? "";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      {
        name: "description",
        content:
          "One place for the important stuff you own and the documents that go with it — scan any document to a searchable PDF right in your browser. Part of the VeraKeep™ suite.",
      },
      {
        property: "og:title",
        content: "DocSnap — one place for the important stuff you own and the documents that go with it",
      },
      {
        property: "og:description",
        content:
          "Scan any document to a searchable PDF right in your browser, then keep everything you own and its paperwork organized in one place — part of the VeraKeep™ suite.",
      },
      {
        property: "og:image",
        content: "https://docsnapapp.com/icon-512.png",
      },
      {
        property: "og:type",
        content: "website",
      },
      {
        name: "twitter:card",
        content: "summary_large_image",
      },
      {
        name: "twitter:title",
        content: "DocSnap — one place for the important stuff you own and the documents that go with it",
      },
      {
        name: "twitter:description",
        content:
          "Scan any document to a searchable PDF right in your browser — part of the VeraKeep™ suite.",
      },
      {
        name: "twitter:image",
        content: "https://docsnapapp.com/icon-512.png",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "apple-touch-icon", href: "/icon-192.png" },
      { rel: "manifest", href: "/manifest.json" },
    ],
  }),
  notFoundComponent: () => <div>Page not found</div>,
  errorComponent: RouteErrorBoundary,
  component: RootComponent,
});

function RootComponent() {
  // Install global handlers for unhandled errors/rejections (client only).
  useEffect(() => installGlobalErrorHandlers(), []);

  return (
    <RootDocument>
      <Outlet />
    </RootDocument>
  );
}

function RootDocument({ children }: { children: ReactNode }) {
  const clerkConfigured = clerkPubKey.length > 0;

  // If the Clerk publishable key is missing we must NOT silently fall back to a
  // development key (that triggers Clerk's "loaded with development keys"
  // warning and a broken dev auth surface in production). Fail loudly instead:
  // show the operator an explicit configuration error naming the exact env var.
  if (!clerkConfigured) {
    return <ClerkConfigMissingScreen />;
  }

  const body = (
    <html lang="en">
      <head>
        <HeadContent />
        {plausibleDomain ? (
          <script
            defer
            data-domain={plausibleDomain}
            src="https://plausible.io/js/script.js"
          />
        ) : null}
      </head>
      <body>
        {/* Splash screen — hidden once React hydrates */}
        <div
          id="splash-screen"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: "#030712",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 72,
              height: 72,
              borderRadius: 18,
              backgroundColor: "#4f46e5",
              animation: "splashPulse 2s ease-in-out infinite",
            }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 64 64" fill="none">
              <path d="M17 16v32M17 16h16c7.18 0 13 5.82 13 13v6c0 7.18-5.82 13-13 13H17" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
              <path d="M46 20l-6 12 6 12" stroke="#a5b4fc" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none"/>
            </svg>
          </div>
          <style>{`
            @keyframes splashPulse {
              0%, 100% { opacity: 0.6; transform: scale(1); }
              50% { opacity: 1; transform: scale(1.06); }
            }
          `}</style>
        </div>
        <script
          dangerouslySetInnerHTML={{
            __html: `document.addEventListener('DOMContentLoaded',function(){var s=document.getElementById('splash-screen');if(s){s.style.opacity='0';s.style.transition='opacity 300ms ease-out';setTimeout(function(){s.remove();},350);}});`,
          }}
        />
        {children}
        <footer className="border-t border-gray-800/50 bg-gray-950 px-6 py-4 text-center text-xs text-gray-600">
          <span>© 2026 DocSnap. All rights reserved.</span>
          <span className="mx-2 text-gray-700" aria-hidden="true">·</span>
          <span>Powered by VeraKeep™</span>
        </footer>
        <PwaRuntime />
        <Scripts />
      </body>
    </html>
  );

  // clerkConfigured is guaranteed truthy here (handled above), so always provide
  // the real production publishable key from import.meta.env.
  return (
    <ClerkProvider publishableKey={clerkPubKey}>
      {body}
    </ClerkProvider>
  );
}

/**
 * Explicit, user-visible configuration error rendered when the Clerk publishable
 * key is missing at build time. Unlike a silent dev-key fallback, this tells the
 * operator exactly which env var must be set, so a misconfigured deploy can't
 * slip through as a broken dev-auth surface.
 */
function ClerkConfigMissingScreen() {
  return (
    <div
      style={{ minHeight: "100vh", backgroundColor: "#030712", color: "#fff" }}
      className="flex flex-col items-center justify-center gap-6 px-6 py-12 text-center"
    >
      <style>{`html,body{margin:0;background:#030712}`}</style>
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-indigo-600 shadow-lg shadow-indigo-600/25">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-9 w-9" fill="none" viewBox="0 0 64 64" aria-hidden="true">
          <path d="M17 16v32M17 16h16c7.18 0 13 5.82 13 13v6c0 7.18-5.82 13-13 13H17" stroke="#fff" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M46 20l-6 12 6 12" stroke="#a5b4fc" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h1 className="text-2xl font-bold tracking-tight">DocSnap © 2026</h1>
      <div className="flex h-16 w-16 items-center justify-center rounded-full bg-red-900/50">
        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
        </svg>
      </div>
      <div className="space-y-2">
        <h2 className="text-xl font-semibold">Configuration error</h2>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-gray-400">
          DocSnap is not configured for authentication. The Clerk publishable key
          is missing from the deploy. Set{" "}
          <code className="rounded bg-gray-800 px-1.5 py-0.5 font-mono text-xs text-indigo-300">
            NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY
          </code>{" "}
          (public, client-safe) in Vercel for both Production and Preview, and
          rebuild/redeploy. Server secrets ({`CLERK_SECRET_KEY`}) stay server-only.
        </p>
      </div>
    </div>
  );
}
