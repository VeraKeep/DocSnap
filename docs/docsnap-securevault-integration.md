# DocSnap → SecureVault Integration (Opt-In Connected Identity)

DocSnap (a real client-side scanner) integrates with **SecureVault** (the
encrypted single-system-of-record vault) using the owner-approved **OPT-IN
CONNECTED IDENTITY** model. A DocSnap (Clerk) user can choose to connect their
SecureVault (Supabase) account, and DocSnap pushes scanned documents into that
user's vault on demand via SecureVault's `POST /v1/ingest`.

> **Privacy promise preserved:** documents leave the device **only** when the
> user (1) explicitly connects their vault and (2) explicitly taps **Save to
> Vault**. Default off — nothing is pushed automatically.

## Identity model

- **Clerk** = DocSnap identity (the scanner's sign-in).
- **Supabase** = SecureVault identity. `POST /v1/ingest` resolves the document
  owner from the caller's Supabase bearer token, so the document lands in
  *that user's* vault.
- On **connect**, the user signs in to SecureVault; DocSnap captures the
  SecureVault session/access token and stores it **server-side only**, mapped
  to their `clerk_user_id` (Neon table `securevault_connections`).
- On subsequent **Save to Vault**, DocSnap's server looks up the stored token
  and forwards the document to SecureVault. The browser never holds the token
  beyond the connect step.

## Flow

### 1. Connect your vault (opt-in)
User opens the **Connect vault** modal (from the preview screen or Save to
Vault). Two capture paths:

- **Embedded sign-in** (when `VITE_SECUREVAULT_SUPABASE_URL` /
  `VITE_SECUREVAULT_SUPABASE_ANON_KEY` are configured): email + password are
  POSTed **directly to Supabase's auth endpoint** (`/auth/v1/token?grant_type=password`)
  — credentials never touch the DocSnap server. The resulting access token
  (+ refresh token + expiry + vault user id) is sent once to
  `POST /api/securevault/connect`.
- **Paste token** (always available): user pastes their SecureVault access
  token, sent to the same connect endpoint.

`POST /api/securevault/connect` (Clerk-auth) stores the token in Neon mapped to
the Clerk user and returns `{ connected: true }`. The token is **not** returned
to the client afterwards.

### 2. Save to Vault (explicit action)
In the scanner's post-scan UI (`PDFActions`), a **Save to Vault** button
appears next to **Save to Cloud** when a connection exists (`GET
/api/securevault` → `connected: true`). If the user is signed in but not
connected, a **Connect vault** button is shown instead.

On click, DocSnap builds the PDF blob (same `useOCR`/`generatePlainPDF` path)
client-side and `POST`s it as multipart to `POST /api/securevault/ingest`.
That DocSnap server route:

1. Resolves the Clerk user server-side (`getVerifiedUserId`).
2. Looks up their stored SecureVault token in Neon; 404 if none.
3. Forwards the file to SecureVault `POST {SECUREVAULT_API_URL}/v1/ingest`
   with `Authorization: Bearer <securevault-token>`, `source=docsnap`, and a
   generated `source_ref` (`ds-YYYYMMDD-xxxxx`) plus optional
   title/type/category/tags.
4. Returns `{ document_id, status }` to the DocSnap client, which shows the
   SecureVault `document_id`.

The **SecureVault token never leaves the server** after connect, is never
logged, never returned to the client after save, and never appears in the
client bundle.

## API (DocSnap server routes — mounted in serve.ts + vercel-entry.ts)

| Route | Auth | Purpose |
| ----- | ---- | ------- |
| `POST /api/securevault/connect` | Clerk | store a SecureVault token for the user |
| `GET  /api/securevault`          | Clerk | `{ connected: boolean }` (never the token) |
| `DELETE /api/securevault`        | Clerk | disconnect (delete stored token) |
| `POST /api/securevault/ingest`   | Clerk | forward a PDF blob to SecureVault `/v1/ingest` |

### Example: Save to Vault (client → DocSnap server)
```http
POST /api/securevault/ingest
Content-Type: multipart/form-data; boundary=...
(signed-in Clerk session cookie)

file: <pdf blob, filename "2026 Taxes.pdf">
title: 2026 Taxes
```

Response:
```json
{
  "document_id": "bb7c4f2e-8f1a-4b2e-9d3c-6a1f0c9e2b41",
  "status": {
    "uploaded": true, "hash": "d2c5…",
    "ocr_status": "pending", "ai_status": "pending",
    "source": "docsnap", "source_ref": "ds-20260831-a1b2c3"
  }
}
```

Error codes: `401` (not signed in / SecureVault token invalid — reconnect),
`404 not_connected` (no stored connection), `400` (no file),
`502` (SecureVault unreachable/rejected), `503` (`SECUREVAULT_API_URL`
unconfigured).

### Example: Connect
Client (already signed in with the SecureVault token):
```json
POST /api/securevault/connect
{ "accessToken": "<securevault access token>", "refreshToken": "<...>", "expiresAt": "2026-08-31T12:00:00.000Z", "vaultUserId": "<supabase uid>" }
```
Response: `{ "connected": true }`

## Config (env)
- `SECUREVAULT_API_URL` — the SecureVault host whose `/v1/ingest` we call. NOT
  hardcoded; each environment points at its own SecureVault host. When unset
  the feature reports `503` rather than guessing.
- `VITE_SECUREVAULT_SUPABASE_URL` / `VITE_SECUREVAULT_SUPABASE_ANON_KEY` —
  optional, enables the embedded SecureVault sign-in in the connect modal.
- `DATABASE_URL` — Neon (already the DocSnap DB pattern) storing
  `securevault_connections`.
- Clerk env (`CLERK_SECRET_KEY`, publishable key) — already required for
  `getVerifiedUserId`.

## Files
- `src/db/securevaultConnection.ts` — Neon-backed token store (get/save/delete).
- `src/lib/securevaultServer.ts` — server-side SecureVault client (`/v1/ingest`).
- `src/routes/api/-securevault.ts` — connect / status / disconnect / ingest routes.
- `src/hooks/useSecureVault.ts` — client hook (connection state + actions).
- `src/components/SecureVaultConnectModal.tsx` — opt-in connect UI.
- `src/components/PDFActions.tsx` / `PreviewScreen.tsx` / `src/routes/index.tsx`
  — "Save to Vault" / "Connect vault" buttons + wiring.
- `src/db-schema.sql` — `securevault_connections` table.

## Security notes & follow-ups
- **At-rest encryption** of the stored token (e.g. app-level AES key or Neon
  pgcrypto) is a follow-up; today it is scoped server-side in Neon (TLS in
  transit), consistent with the rest of DocSnap's data.
- **Refresh-token handling:** `refresh_token` + `expires_at` are stored but not
  yet used to transparently re-auth an expired access token (the route returns
  `401 token_expired` and asks the user to reconnect). Wire a
  `/auth/v1/token?grant_type=refresh_token` call as a follow-up.
- **Token capture UX:** a full OAuth (PKCE) redirect to SecureVault would be
  the friendliest; it needs SecureVault to expose an OAuth client + callback
  DocSnap can register (not yet available). The embedded sign-in / token-paste
  modal is the implementable first slice; the stored token is identical either
  way.
- `VITE_SECUREVAULT_SUPABASE_URL` isn't wired in DocSnap's deployed env yet, so
  the practical capture path today is the paste-token fallback.
- Receipt/entity linkage (`document_relationships`) and a "already saved this
  scan to the vault" duplicate check are future work.
