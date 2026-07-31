/**
 * Privacy-first analytics via Plausible.
 * All calls are wrapped in try/catch — analytics must never break the app.
 */

export function trackEvent(name: string, props?: Record<string, string | number | boolean>) {
  try {
    if (typeof window !== "undefined" && window.plausible) {
      window.plausible(name, { props: props ?? {} });
    }
  } catch {
    // silently ignore — app must never crash because of analytics
  }
}
