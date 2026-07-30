import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import { ClerkProvider } from "@clerk/tanstack-start";
import type { ReactNode } from "react";

import appCss from "~/styles/app.css?url";

const clerkPubKey = process.env.CLERK_PUBLISHABLE_KEY ?? "";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DocSnap — Scan documents to PDF" },
      {
        name: "description",
        content:
          "Scan documents to PDF instantly — no account, no upload, no Adobe license. Everything runs locally in your browser.",
      },
      {
        property: "og:title",
        content: "DocSnap — Scan documents to PDF",
      },
      {
        property: "og:description",
        content:
          "Scan documents to PDF instantly — no account, no upload, no Adobe license. Everything runs locally in your browser.",
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
        content: "DocSnap — Scan documents to PDF",
      },
      {
        name: "twitter:description",
        content:
          "Scan documents to PDF instantly — no account, no upload, no Adobe license.",
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
  component: RootComponent,
});

function RootComponent() {
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
      </head>
      <body>
        {children}
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
