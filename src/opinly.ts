import { createOpinlyClient } from "@opinly/backend";
import type { OpinlyConfig } from "@opinly/shared";

import { SITE_ORIGIN } from "~/siteConfig";

/** Shared Opinly client. The public, read-only key is supplied by Vite at build time. */
export const opinly = createOpinlyClient({
  apiKey: import.meta.env.VITE_OPINLY_API_KEY,
});

/** Keep rendering, canonical URLs, JSON-LD, and the image proxy on one config. */
export const opinlyConfig: OpinlyConfig = {
  imagesPrefix: "/images",
  siteUrl: SITE_ORIGIN,
  blogPrefix: "/blog",
  siteName: "DocSnap Blog",
};
