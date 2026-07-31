/**
 * useSubscription — lightweight subscription state hook.
 *
 * TODO: Replace with Stripe webhook/subscription check when payment processing is live.
 * Currently all users default to free tier. After Stripe is connected:
 *   - Add a server function that checks the user's Stripe subscription status
 *   - Call it on mount when the user is signed in
 *   - Return real isPro / docLimit values based on the response
 */

import { useMemo } from "react";

export interface SubscriptionState {
  /** Whether the user has an active Pro subscription */
  isPro: boolean;
  /** Maximum cloud documents allowed (Infinity for Pro) */
  docLimit: number;
  /** URL to the upgrade/pricing page */
  upgradeUrl: string;
}

/**
 * Returns the current user's subscription state.
 * Currently hardcoded to free tier until Stripe integration is complete.
 */
export function useSubscription(): SubscriptionState {
  return useMemo<SubscriptionState>(
    () => ({
      isPro: false,
      docLimit: 25,
      upgradeUrl: "/pricing",
    }),
    [],
  );
}
