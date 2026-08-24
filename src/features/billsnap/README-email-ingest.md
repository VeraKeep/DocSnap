# BillSnap Email Ingestion

Turn an emailed bill (image or PDF attachment, or bill text in the body) into a
confirmed, owner-scoped `bills` record using the SAME extraction and record path
as interactive capture. There are two layers:

- **Ingestion** (server-side, shipped first): `POST /api/billsnap-email-ingest`
  takes a normalized email payload and writes the bill.
- **Transport** (this PR): per-user inbound addresses + a provider webhook
  (`POST /api/billsnap-email-inbound`) so a real inbound-mail provider can
  deliver forwarded bill emails end-to-end.

## Ingestion payload (JSON)

```jsonc
{
  "secret": "...",                 // or header x-billsnap-ingest-secret
  "owner": { "clerkUserId": "user_..." },  // resolved by the transport, see below
  "subject": "Your Acme Electric bill",
  "from": "billing@acme.example",
  "bodyText": "Amount due: $88.12 by 2026-05-01 ...",
  "attachment": {
    "filename": "bill.jpg",         // or bill.pdf
    "mimeType": "image/jpeg",       // image/jpeg|png|webp, or application/pdf
    "base64": "<raw bytes, no data: prefix>"
  }
}
```

Behavior (all reuse the capture path):

- **Image attachment** → `extractBill` (the exact OpenAI vision call capture uses).
- **Body text** (no image) → `extractBillFromText` (same model/schema, text).
- **PDF attachment** → cannot be auto-extracted **server-side** because the existing
  rasterizer `src/features/billsnap/pdf.ts` (`pdfFirstPageToPng`) runs in the
  browser (canvas). A PDF email is still saved as an editable draft (never
  dropped) and the caller is told to route it through interactive capture (which
  rasterizes via `pdf.ts`) — or the transport converts the PDF to a PNG first.
- **Unreadable / unsupported / missing attachment** → a best-effort editable
  draft is still written (vendor guessed from the subject/`from` header), and the
  result carries a clear `extraction.available: false` note. Nothing is silently
  dropped. Nothing is written only when the email is genuinely empty or the owner
  lacks the paid add-on.

Outcomes (the transport emails these back to the sender):

- `created` — bill written with full auto-extraction.
- `created_without_extraction` — bill written as an editable draft.
- `addon_required` — owner doesn't own the BillSnap add-on; no bill, no AI spend.
- `empty_email` — no usable content.
- `db_not_configured` — `DATABASE_URL` not set.

## Ingestion auth & ownership

The ingest endpoint is a **machine endpoint**, not a Clerk-session route. It
authenticates with a shared secret and stays fail-closed:

- Header `x-billsnap-ingest-secret` (or body `secret`) must equal
  `BILLSNAP_EMAIL_INGEST_SECRET`. If the env var is unset the endpoint returns 501.
- Bills are written owner-scoped to `users.clerk_user_id` (the same `bills` table
  and column as capture). The owner id is supplied by the caller, which is trusted
  infrastructure holding the secret. The BillSnap add-on gate (`hasBillSnapAddon`)
  is enforced before any write or AI call, so a caller can only create bills for
  users who actually own the add-on.

## Per-user inbound address + owner resolution (Part A)

When an owner turns on "email in" (ServerFn or server helper), we generate a
unique, unguessable 32-char base64url token and expose the inbound address:

```
bills+<token>@inbound.docsnapapp.com
```

The token is stored normalized (token-validated) in `billsnap_inbound_addresses`,
scoped to `users.clerk_user_id` (one row per user, indexed by token). A provider
webhook extracts the token from the `to` recipient and calls
`resolveOwnerFromRecipient` / `lookupClerkUserByInboundToken` to map it back to
the owning Clerk user. Rotation writes a fresh token (old address stops
resolving); disabling/revoking deletes the row (address stops resolving). Fail
closed: unknown, malformed, or disabled tokens resolve to `null` — never a
guessed owner.

## Provider webhook (Part B) — `POST /api/billsnap-email-inbound`

The actual transport receiver. It authenticates, resolves the owner from `to`,
reshapes the payload, and calls the same `ingestBillFromEmail`, returning the
same structured outcome (which the provider emails back to the sender — nothing
is silently dropped).

**Auth (fail closed):** a secret must match `BILLSNAP_INBOUND_SECRET` (falls back
to `BILLSNAP_EMAIL_INGEST_SECRET`). It is delivered via header
`x-billsnap-inbound-secret`, OR query `?secret=`, OR a `secret` body/form field —
pick whichever your provider can set (many can only post to a URL, so `?secret=`
is the reliable route). Unset env var → 501; wrong/missing → 401.

**Provider payloads (mapped case-insensitively):**

| Field (canonical) | SendGrid Inbound Parse | Postmark Inbound |
|---|---|---|
| recipient → owner | `to` (multipart field or JSON) | `To` (JSON) |
| from | `from` | `From` |
| subject | `subject` | `Subject` |
| body text | `text` | `TextBody` / `Text` |
| attachment filename | multipart part's Content-Disposition filename | `Attachments[].Name` |
| attachment mime | multipart part Content-Type | `Attachments[].ContentType` |
| attachment bytes | multipart file part (raw bytes) | `Attachments[].Content` (base64) |

SendGrid posts `multipart/form-data` (default) — headers/body as string fields,
each attachment as its own file part. Postmark posts JSON. Both are accepted; the
handler strips any `data:<mime>;base64,` prefix and picks the first image/pdf
attachment (image/jpeg|png|webp are vision-extracted, PDF becomes an editable
draft, body text is used as fallback — identical to the ingest path).

**Outcome codes returned to the provider (HTTP 200 so it emails them back):**
`created`, `created_without_extraction`, `addon_required`, `empty_email`,
`db_not_configured`, plus `unknown_recipient` (the `to` token isn't an active
BillSnap address — surfaced, never dropped). 4xx is reserved for auth/shape
failures. `GET /api/billsnap-email-inbound` returns a handshake/describe doc.

## Wiring

Both server-side endpoints are mounted in `serve.ts` (local) and `vercel-entry.ts`
(production single-function), alongside the Stripe webhook and the existing
ingest route.

## Still needs the owner/lead to go fully live

The server-side receiver is complete and build-verified, but no inbound mail
provider is provisioned yet. To deliver end-to-end:

1. **Create a provider account + DNS record** for `inbound.docsnapapp.com`
   (or set `BILLSNAP_INBOUND_DOMAIN` to a different subdomain) — e.g. SendGrid
   Inbound Parse or Postmark Inbound — and configure it to POST parsed mail to
   `https://docsnapapp.com/api/billsnap-email-inbound?secret=...`.
2. **Apply the migration**: `psql "$DATABASE_URL" -f src/db-schema.sql` (adds
   `billsnap_inbound_addresses`) on Neon.
3. **Set env vars** (below) and turn on "email-in" for a test owner.
4. Optional: server-side PDF rasterization of email-attached PDFs (currently they
   become editable drafts).

## Env vars the transport now needs

- `BILLSNAP_INBOUND_SECRET` — webhook auth for `/api/billsnap-email-inbound`
  (falls back to `BILLSNAP_EMAIL_INGEST_SECRET`; set either).
- `BILLSNAP_INBOUND_DOMAIN` — the domain inbound addresses live on
  (default `inbound.docsnapapp.com`).
- `BILLSNAP_EMAIL_INGEST_SECRET` — auth for the normalized ingest endpoint.
- `DATABASE_URL` — Neon Postgres (required for the token mapping and bills).
- `OPENAI_API_KEY` — for auto-extraction of image/text emails; without it bills
  become editable drafts.
