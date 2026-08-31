import { useUser } from "@clerk/tanstack-start";
import type { ReactNode } from "react";

/**
 * Build the href for a buy.stripe.com Payment Link, stamping the signed-in
 * Clerk user's identity onto it so the Stripe webhook can grant the bought
 * entitlement to EXACTLY that user:
 *
 *  - `client_reference_id` = the Clerk user id. The webhook reads this first
 *    and grants to that user directly — even if the buyer types a different
 *    billing email at Stripe (the legacy email-lookup path was the root cause
 *    of "paid but not granted"). Works because Stripe Payment Links accept a
 *    `client_reference_id` query param and echo it back on
 *    `checkout.session.completed`.
 *  - `prefilled_email` = prefills the buying email to match the user's Clerk
 *    email, which also keeps the email-lookup fallback consistent.
 *
 * Anonymous visitors get the plain link, with no identity attached. Their
 * purchase is still never dropped: the webhook records it in the
 * pending-entitlement queue and it is granted the first time they sign in with
 * the buying email.
 *
 * These are public, non-secret query params on a public Payment Link — no
 * Stripe key is required, and the buyer still pays for exactly the entitlement
 * the linked price grants.
 */
export function checkoutHref(
  baseUrl: string,
  userId?: string | null,
  email?: string | null,
): string {
  const params = new URLSearchParams();
  if (userId) params.set("client_reference_id", userId);
  if (email) params.set("prefilled_email", email);
  const qs = params.toString();
  return qs ? `${baseUrl}?${qs}` : baseUrl;
}

interface CheckoutLinkProps {
  /** The base buy.stripe.com Payment Link URL. */
  href: string;
  className?: string;
  children: ReactNode;
  /** Extra target (e.g. "_blank"). Default is same-tab. */
  target?: string;
}

/**
 * An <a> for a Stripe Payment Link that appends the signed-in user's Clerk id
 * (as `client_reference_id`) and email (as `prefilled_email`) to the URL — the
 * client side of the "paid-but-not-granted" fix. Falls back to the plain link
 * for anonymous/loading users.
 */
export function CheckoutLink({ href, className, children, target }: CheckoutLinkProps) {
  const { user, isLoaded } = useUser();
  // Only attach identity once the Clerk session has loaded (server-rendered
  // HTML carries the plain link; hydration adds the identity params).
  const userId = isLoaded ? (user?.id ?? null) : null;
  const email = isLoaded ? (user?.primaryEmailAddress?.emailAddress ?? null) : null;
  return (
    <a href={checkoutHref(href, userId, email)} className={className} target={target}>
      {children}
    </a>
  );
}
