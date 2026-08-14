/**
 * useSubscription — subscription state hook backed by the Neon database.
 *
 * When the user is signed in (Clerk), this fetches their subscription status
 * via a TanStack Start server function (RPC to the server). The server
 * function imports DB code that is stripped from the client bundle.
 *
 * Anonymous users always get the free tier.
 */

import { useMemo, useEffect, useState } from "react";
import { useUser } from "@clerk/tanstack-start";
import { getPortalUrl, getSubscription, syncUser } from "../subscription";
import type { Tier } from "../subscription";

export interface SubscriptionState {
  /** Current plan tier: free | personal | household | complete */
  tier: Tier;
  /** Whether the user has an active Pro subscription */
  isPro: boolean;
  /** Maximum cloud documents allowed (Infinity for Pro) */
  docLimit: number;
  /** URL to the upgrade/pricing page */
  upgradeUrl: string;
  /** Stripe Customer Portal URL, when configured */
  portalUrl: string | null;
  /** True while the subscription status is being fetched */
  isLoading: boolean;
}

const FREE_DOC_LIMIT = 25;

/** Default state used when not signed in or while loading. */
const FREE_STATE: Omit<SubscriptionState, "portalUrl"> = {
  tier: "free",
  isPro: false,
  docLimit: FREE_DOC_LIMIT,
  upgradeUrl: "/pricing",
  isLoading: false,
};

/**
 * Returns the current user's subscription state.
 *
 * Calls getSubscription (a createServerFn) which only executes DB code on
 * the server. When DATABASE_URL is not configured, the server function
 * returns free-tier defaults.
 */
export function useSubscription(): SubscriptionState {
  const { user, isLoaded: clerkLoaded } = useUser();
  const [dbStatus, setDbStatus] = useState<{
    tier: Tier;
    isPro: boolean;
    expiresAt: string | null;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [portalUrl, setPortalUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getPortalUrl()
      .then((url) => {
        if (!cancelled) setPortalUrl(url);
      })
      .catch((err) => {
        console.error("[useSubscription] Failed to fetch portal URL:", err);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const clerkUserId = clerkLoaded ? user?.id ?? null : null;
  const email = clerkLoaded ? user?.primaryEmailAddress?.emailAddress ?? null : null;

  useEffect(() => {
    if (!clerkUserId) {
      setDbStatus(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    async function fetchStatus() {
      try {
        // Sync the user record (creates or updates email) so the webhook
        // can later look up the user by their checkout email.
        if (email) {
          await syncUser({ clerkUserId: clerkUserId!, email });
        }
        const info = await getSubscription(clerkUserId!);
        if (!cancelled) {
          setDbStatus(info);
          setLoading(false);
        }
      } catch (err) {
        console.error("[useSubscription] Failed to fetch:", err);
        if (!cancelled) {
          setDbStatus(null);
          setLoading(false);
        }
      }
    }

    fetchStatus();
    return () => {
      cancelled = true;
    };
  }, [clerkUserId, email]);

  return useMemo<SubscriptionState>(() => {
    // No user signed in → free tier.
    if (!clerkUserId || !dbStatus) {
      return {
        ...FREE_STATE,
        portalUrl,
        isLoading: loading || (clerkLoaded && !!clerkUserId && dbStatus === null),
      };
    }

    return {
      tier: dbStatus.tier,
      isPro: dbStatus.isPro,
      docLimit: dbStatus.isPro ? Infinity : FREE_DOC_LIMIT,
      upgradeUrl: "/pricing",
      portalUrl,
      isLoading: false,
    };
  }, [clerkUserId, dbStatus, loading, clerkLoaded, portalUrl]);
}
