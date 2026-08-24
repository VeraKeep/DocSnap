# BillSnap Email Ingestion

This is the last capability TODO in the BillSnap plan — turn an emailed bill
(image or PDF attachment, or bill text in the body) into a confirmed `bills`
record using the SAME extraction and record path as interactive capture.

## What's built (this PR)

- `src/routes/api/-billsnap-email-ingest.ts` — HTTP ingress. `POST /api/billsnap-email-ingest`
  with a normalized email payload.
- `src/features/billsnap/emailIngest.ts` — the ingestion pipeline (transport-agnostic).
- `src/features/billsnap/server.ts` — exported `extractBill` (the existing vision
  path) and added `extractBillFromText` (same model/schema, text mode). Both share
  one `callBillExtraction` core — no parallel extraction pipeline.

Payload accepted (JSON):

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

## Auth & ownership

This is a **machine endpoint**, not a Clerk-session route. It authenticates with a
shared secret so it stays fail-closed:

- Header `x-billsnap-ingest-secret` (or body `secret`) must equal
  `BILLSNAP_EMAIL_INGEST_SECRET`. If the env var is unset the endpoint returns 501.
- Bills are written owner-scoped to `users.clerk_user_id` (the same `bills` table
  and column as capture). The owner id is supplied by the caller, which is trusted
  infrastructure holding the secret. The BillSnap add-on gate (`hasBillSnapAddon`)
  is enforced before any write or AI call, so a caller can only create bills for
  users who actually own the add-on.

## Transport dependency (NOT yet wired — the external piece)

There is no live inbound mail provider yet. This PR deliberately stops short of
standing one up. To go live, plug any of these into `POST /api/billsnap-email-ingest`,
resolving `owner.clerkUserId` from the receiving address (e.g. a per-user inbound
address token like `bills+<token>@docsnapapp.com`, generated and stored when the
user enables email-in, then looked up by the provider webhook):

1. **Cloudflare Email Workers** — forward inbound email → POST JSON here (cheap, on
   the existing stack).
2. **Postmark / SendGrid Inbound Parse** — provider webhook delivers the parsed
   email + attachments; map recipient → owner.
3. **An SMTP-to-HTTP bridge** (e.g. Cloudflare's `email-routing` > worker) that
   base64-encodes attachments into this payload.

Set `BILLSNAP_EMAIL_INGEST_SECRET` (ingress auth), `DATABASE_URL`, and
`OPENAI_API_KEY` (for auto-extraction; without it email bills become drafts).
