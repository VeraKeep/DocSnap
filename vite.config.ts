import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  // Expose NEXT_PUBLIC_* vars (the owner's Clerk publishable key) to
  // import.meta.env in addition to Vite's default VITE_ prefix, so client
  // code (e.g. __root.tsx's ClerkProvider) receives them at build time.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],
  build: {
    rollupOptions: {
      output: {
        // Keep framework and optional integrations out of route/application
        // chunks. This also gives the browser stable cache boundaries for
        // dependencies that change at a different cadence than the app.
        manualChunks(id) {
          if (!id.includes("node_modules")) {
            if (
              id.includes("/src/hooks/useCloudSync") ||
              id.includes("/src/cloudStorage") ||
              id.includes("/src/cloud")
            ) {
              return "vendor-upload";
            }
            return undefined;
          }

          if (id.includes("html2canvas")) return "vendor-html2canvas";
          if (id.includes("dompurify")) return "vendor-dompurify";
          if (id.includes("tesseract.js")) return "vendor-tesseract";
          if (id.includes("/jspdf/")) return "vendor-jspdf";

          if (id.includes("/react/") || id.includes("/react-dom/")) {
            return "vendor-react";
          }
          if (id.includes("/@clerk/") || id.includes("/clerk/") || id.includes("clerk")) {
            return "vendor-clerk";
          }
          if (
            id.includes("/@tanstack/react-router/") ||
            id.includes("/@tanstack/router-") ||
            id.includes("/@tanstack/start-")
          ) {
            return "vendor-router";
          }
          if (id.includes("/@uploadthing/") || id.includes("/uploadthing/")) {
            return "vendor-upload";
          }

          return undefined;
        },
      },
    },
  },
  server: {
    port: 3000,
    host: true,
    // The site is reverse-proxied behind <label>.<PUBLIC_SITE_DOMAIN>; the proxy
    // masks the Host to localhost:3000, but accept any host so a dev server never
    // rejects a proxied request with "Blocked request".
    allowedHosts: true,
  },
  plugins: [
    tailwindcss(),
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tanstackStart(),
    viteReact(),
  ],
});
