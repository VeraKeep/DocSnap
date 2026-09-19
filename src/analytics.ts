/**
 * Privacy-first analytics via Plausible.
 *
 * Guardrails:
 * - never send document/OCR/file/user content
 * - campaign attribution is limited to standard UTM values
 * - analytics failures must never break the product
 */
type AnalyticsProps = Record<string, string | number | boolean>;

declare global {
  interface Window {
    plausible?: (event: string, options?: { props?: AnalyticsProps; u?: string }) => void;
  }
}

const CAMPAIGN_KEY = "docsnap_campaign";
const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

function safeCampaign(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    const current = new URLSearchParams(window.location.search);
    const captured: Record<string, string> = {};
    for (const key of UTM_KEYS) {
      const value = current.get(key)?.trim().slice(0, 120);
      if (value) captured[key] = value;
    }
    if (Object.keys(captured).length) {
      sessionStorage.setItem(CAMPAIGN_KEY, JSON.stringify(captured));
      return captured;
    }
    const stored = sessionStorage.getItem(CAMPAIGN_KEY);
    return stored ? JSON.parse(stored) as Record<string, string> : {};
  } catch {
    return {};
  }
}

export function trackEvent(name: string, props?: AnalyticsProps) {
  try {
    if (typeof window !== "undefined" && window.plausible) {
      window.plausible(name, { props: { ...safeCampaign(), ...(props ?? {}) } });
    }
  } catch {
    // Analytics must never crash or block the product.
  }
}
