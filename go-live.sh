#!/usr/bin/env bash
# Publish this site live to Vercel and promote it to the production aliases.
#
# WHY THIS VERSION MATTERS (fixes the DocSnap production outage):
#   DocSnap is a TanStack Start app. Clerk is wired server-side via
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, which Vite inlines AT BUILD TIME into the
#   client + SSR bundles. If it is missing/empty when `bun run build` runs (or
#   when Vercel runs the git-connected build with a project that has no env), the
#   root route renders an operator-facing "DocSnap is not configured for
#   authentication" page that is served with HTTP 200 — so a plain `curl` status
#   check is a false positive. This script therefore:
#     * REQUIRES NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to be set before building and
#       fails loudly if it isn't (never silently ship the config-error bundle),
#     * exports the NEXT_PUBLIC_* build vars into the `bun run build` shell so
#       they get inlined correctly,
#     * passes runtime secrets with `-e` at deploy time, and
#     * promotes the deployment to the production aliases once it is Ready.
#
# Env contract:
#   VERCEL_TOKEN                      (required)
#   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY (required at build — value must be the real
#                                      Clerk publishable key, e.g. pk_test_...)
#   NEXT_PUBLIC_PLAUSIBLE_DOMAIN      (optional, build-time)
#   CLERK_SECRET_KEY, DATABASE_URL, OPENAI_API_KEY, STRIPE_WEBHOOK_SECRET,
#   STRIPE_CUSTOMER_PORTAL_URL, UPLOADTHING_SECRET, BILLSNAP_EMAIL_INGEST_SECRET,
#   BILLSNAP_INBOUND_SECRET, BILLSNAP_INBOUND_DOMAIN
#                                     (optional; passed as runtime env at deploy)
#   VERCEL_SCOPE / VERCEL_TEAM_ID     (optional; auto-resolved from the token)
#   VERCEL_PROJECT_NAME               (optional; default = dir basename)
#   VERCEL_ALIASES                    (optional; space-separated domains to point
#                                      at the deployment, default:
#                                      "docsnapapp.com docsnap-ten.vercel.app")
set -euo pipefail
cd "$(dirname "$0")"
umask 002

: "${VERCEL_TOKEN:?set VERCEL_TOKEN (collect it from the owner first)}"
PROJECT_NAME="${VERCEL_PROJECT_NAME:-$(basename "$(pwd)")}"
VERCEL="bunx vercel@latest"

# --- Build-time publishable key is MANDATORY ---
# Without it the bundle SSRs the "not configured for authentication" page. Fail
# loudly instead of shipping that page (it serves HTTP 200, so it would go
# unnoticed by status checks).
if [ -z "${NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY:-}" ]; then
  echo "ERROR: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY is not set." >&2
  echo "Clerk inlines this at build time; a missing value deploys the config-error page." >&2
  exit 1
fi

# Resolve the token's team (slug for --scope, id for the make-public API call).
# Empty for a personal-account token. bun is always present in the sandbox.
if [ -z "${VERCEL_SCOPE:-}" ] || [ -z "${VERCEL_TEAM_ID:-}" ]; then
  RESOLVED="$(VERCEL_TOKEN="$VERCEL_TOKEN" bun -e '
    const h = { headers: { Authorization: "Bearer " + process.env.VERCEL_TOKEN } };
    const [u, tj] = await Promise.all([
      fetch("https://api.vercel.com/v2/user", h).then((r) => r.json()).catch(() => ({})),
      fetch("https://api.vercel.com/v2/teams?limit=50", h).then((r) => r.json()).catch(() => ({})),
    ]);
    const teams = tj.teams || [];
    const def = (u.user || u || {}).defaultTeamId;
    const t = teams.find((x) => x.id === def) || teams[0];
    if (t) process.stdout.write(t.id + " " + t.slug);
  ' 2>/dev/null || true)"
  VERCEL_TEAM_ID="${VERCEL_TEAM_ID:-${RESOLVED%% *}}"
  [ "$RESOLVED" != "${RESOLVED#* }" ] && VERCEL_SCOPE="${VERCEL_SCOPE:-${RESOLVED##* }}"
fi

echo "==> building Vercel bundle (publishable key set: $([ ${#NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY} -gt 0 ] && echo yes || echo no))"
export NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY NEXT_PUBLIC_PLAUSIBLE_DOMAIN
bash ./build-vercel.sh

SCOPE_ARGS=()
if [ -n "${VERCEL_SCOPE:-}" ]; then SCOPE_ARGS=(--scope "$VERCEL_SCOPE"); fi

# Runtime secrets passed with -e so the serverless runtime has them.
ENV_ARGS=()
for k in CLERK_SECRET_KEY DATABASE_URL OPENAI_API_KEY STRIPE_WEBHOOK_SECRET \
         STRIPE_CUSTOMER_PORTAL_URL UPLOADTHING_SECRET BILLSNAP_EMAIL_INGEST_SECRET \
         BILLSNAP_INBOUND_SECRET BILLSNAP_INBOUND_DOMAIN; do
  v="${!k:-}"
  if [ -n "$v" ]; then ENV_ARGS+=(-e "$k=$v"); fi
done

echo "==> deploying${VERCEL_SCOPE:+ (scope: $VERCEL_SCOPE)}"
DEPLOY_OUT="$($VERCEL deploy --prebuilt --yes --token "$VERCEL_TOKEN" \
  --name "$PROJECT_NAME" "${SCOPE_ARGS[@]}" "${ENV_ARGS[@]}" 2>&1)" || {
  printf '%s\n' "$DEPLOY_OUT" >&2
  exit 1
}
LIVE_URL="$(printf '%s\n' "$DEPLOY_OUT" | grep -oE 'https://[a-zA-Z0-9._-]+\.vercel\.app' | tail -1)"

if [ -z "$LIVE_URL" ]; then
  echo "deploy finished but no live URL was parsed — output above" >&2
  printf '%s\n' "$DEPLOY_OUT" >&2
  exit 1
fi

echo "==> making the project public"
TEAM_QS=""
if [ -n "${VERCEL_TEAM_ID:-}" ]; then TEAM_QS="?teamId=$VERCEL_TEAM_ID"; fi
curl -sf -X PATCH "https://api.vercel.com/v9/projects/${PROJECT_NAME}${TEAM_QS}" \
  -H "Authorization: Bearer $VERCEL_TOKEN" -H "Content-Type: application/json" \
  -d '{"ssoProtection":null}' >/dev/null ||
  echo "warning: could not disable SSO protection (site may show a login wall)" >&2

echo "==> pointing production aliases at the deployment"
for alias in ${VERCEL_ALIASES:-docsnapapp.com docsnap-ten.vercel.app}; do
  echo "  $alias -> $LIVE_URL"
  "$VERCEL" alias set "$LIVE_URL" "$alias" --token "$VERCEL_TOKEN" "${SCOPE_ARGS[@]}" \
    >/dev/null 2>&1 || echo "warning: could not alias $alias" >&2
done

echo "LIVE: $LIVE_URL"
