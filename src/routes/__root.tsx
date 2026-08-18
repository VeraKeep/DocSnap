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
// reach the browser. NEXT_PUBLIC_ vars are exposed to import.meta.env via
// envPrefix in vite.config.ts and inlined into both the SSR and client builds.
const clerkPubKey = import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
const plausibleDomain = process.env.PLAUSIBLE_DOMAIN ?? "";

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

  // Always wrap with ClerkProvider so hooks don't throw.
  // When not configured, use a placeholder key; the Clerk client
  // will fail to initialize gracefully and hooks return empty state.
  return (
    <ClerkProvider
      publishableKey={clerkConfigured ? clerkPubKey : "pk_test_Z29vZ2xlLWJvdC02OS5jbGVyay5hY2NvdW50cy5kZXYk"}
    >
      {body}
    </ClerkProvider>
  );
}
