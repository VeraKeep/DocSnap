-- DocSnap Database Schema
-- subscription_status supports 'free', 'personal', 'household', and 'complete'.
-- Legacy 'pro' values are accepted and interpreted as 'personal'.
-- Run this against your Neon Postgres database to set up tables.
-- Usage: psql "$DATABASE_URL" -f db-schema.sql

CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT UNIQUE NOT NULL,
  email TEXT,
  subscription_status TEXT DEFAULT 'free',
  subscription_expires_at TIMESTAMPTZ,
  stripe_customer_id TEXT,
  -- ReceiptSnap is a PAID ADD-ON (owner decision, business-plan rev 15). It is
  -- NOT bundled into any tier; this flag is the ONLY thing that unlocks
  -- /receipts. Fails closed: default false and any missing row = locked.
  addon_receiptsnap BOOLEAN NOT NULL DEFAULT false,
  -- GarageSnap is a PAID ADD-ON (owner decision, business-plan rev 16). It is
  -- NOT bundled into any tier; this flag is the ONLY thing that unlocks
  -- /garage. Fails closed: default false and any missing row = locked.
  addon_garagesnap BOOLEAN NOT NULL DEFAULT false,
  -- HomeSnap is a PAID ADD-ON (owner decision, business-plan rev 2): $3.99/mo
  -- or $39.99/yr, NOT bundled into any tier. This flag is the ONLY thing that
  -- unlocks /homesnap. Fails closed: default false and any missing row = locked.
  addon_homesnap BOOLEAN NOT NULL DEFAULT false,
  -- ContractSnap is a PAID ADD-ON (owner decision, business-plan rev 3): $4.99/mo
  -- or $49.99/yr, NOT bundled into any tier. This flag is the ONLY thing that
  -- unlocks /contracts. Fails closed: default false and any missing row = locked.
  addon_contractsnap BOOLEAN NOT NULL DEFAULT false,
  -- MeetingSnap is intentionally INDEPENDENT from DocSnap's
  -- subscription_status: it has its own 4-tier model
  -- ('free' | 'personal' | 'pro' | 'team'). Fails closed: default 'free'
  -- and any missing row resolves to free.
  meeting_subscription_status TEXT DEFAULT 'free',
  -- BillSnap add-on flag ($2.99/mo or $29.99/yr recurring). Gates /bills on
  -- this exactly like `addon_receiptsnap` gates /receipts. Fails closed:
  -- default false and any missing row = locked.
  addon_billsnap BOOLEAN NOT NULL DEFAULT false,
  -- BookSnap add-on flag ($3.99/mo or $39.99/yr recurring). Gates bookshelf
  -- access exactly like `addon_receiptsnap` gates /receipts. Fails closed:
  -- default false and any missing row = locked.
  addon_booksnap BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
-- Safe upgrade for databases created before the add-on flag existed
-- (CREATE TABLE IF NOT EXISTS does not alter existing tables).
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_receiptsnap BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_garagesnap BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_homesnap BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_contractsnap BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS meeting_subscription_status TEXT DEFAULT 'free';
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_billsnap BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS addon_booksnap BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS webhook_events (
  id SERIAL PRIMARY KEY,
  stripe_event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  payload JSONB,
  processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common lookups
CREATE INDEX IF NOT EXISTS idx_users_clerk_id ON users(clerk_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_id ON webhook_events(stripe_event_id);
-- Pending entitlement grants: a checkout.session.completed that could not be
-- matched to a Clerk user at webhook time (an anonymous buyer, or a buyer
-- whose email is not yet in `users`). The purchase is held here (keyed by the
-- checkout email + price) instead of being dropped, and is granted the moment
-- that email completes sign-in (reconciled from subscription.upsertUser).
-- SAFETY: the queue never grants by itself — it only records what a real
-- Stripe checkout PAID for at a known price, and reconciliation only grants
-- that exact entitlement. Unknown/unlisted prices reconcile as no-ops.
CREATE TABLE IF NOT EXISTS pending_entitlements (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL,
  price_id TEXT,
  stripe_customer_id TEXT,
  checkout_session_id TEXT UNIQUE,
  reconciled_for TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  reconciled_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pending_entitlements_email
  ON pending_entitlements(email);

CREATE TABLE IF NOT EXISTS share_links (
  id UUID PRIMARY KEY,
  document_id TEXT NOT NULL,
  owner_user_id TEXT NOT NULL,
  password_hash TEXT,
  expires_at TIMESTAMPTZ,
  max_downloads INTEGER,
  download_count INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX IF NOT EXISTS idx_share_links_owner ON share_links(owner_user_id);

-- ReceiptSnap module: personal receipt & purchase records.
-- Owner-scoped: each receipt belongs to one Clerk user (users.clerk_user_id).
-- clerk_user_id is intentionally NULLABLE for now: the two pre-existing demo
-- rows (ACME TEST SUPPLY, Hometown Appliances) are labeled demos with no real
-- owner, and owner-filtered queries never expose them to authenticated users.
-- NOT NULL enforcement is deferred until real Clerk identity exists in
-- production (see the ReceiptSnap integration plan, section 3).
CREATE TABLE IF NOT EXISTS receipts (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT,
  merchant TEXT,
  store_date TEXT,
  total NUMERIC,
  currency TEXT,
  items JSONB NOT NULL DEFAULT '[]',
  extra JSONB NOT NULL DEFAULT '{}',
  image_base64 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_receipts_clerk_user_id_created_at
  ON receipts (clerk_user_id, created_at DESC);

-- MeetingSnap module: meeting transcripts and their AI extractions.
-- Owner-scoped: each meeting belongs to one Clerk user (users.clerk_user_id).
-- meetings.source_text is the ORIGINAL transcript (the immutable source of
-- truth). Each meeting has one or more versioned derived extractions in
-- meeting_extractions (JSONB); re-processing a meeting writes a new row rather
-- than mutating history.
CREATE TABLE IF NOT EXISTS meetings (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  title TEXT,
  source_text TEXT NOT NULL,
  -- Reserved for the future "priority processing" Pro feature: a flagged
  -- meeting is queued/processed ahead of others. Unused by Chunk A.
  priority BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meetings_clerk_user_id_created_at
  ON meetings (clerk_user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS meeting_extractions (
  id SERIAL PRIMARY KEY,
  meeting_id INTEGER NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  extraction JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_meeting_extractions_meeting_id
  ON meeting_extractions (meeting_id, created_at DESC);

-- BillSnap module: structured bill records.
-- Owner-scoped: each bill belongs to one Clerk user (users.clerk_user_id).
-- This is the MVP table backing the Capture → Extract → Confirm → Track →
-- Remind → Archive loop and the change-detection smart feature. Status buckets
-- are Upcoming / Due Soon / Overdue / Paid / Archived. `reminder_lead_days` is
-- 0 (on due date) or 1/3/7 days before. amount_due/minimum_payment are kept as
-- NUMERIC so change detection can compare amounts across a vendor's series.
CREATE TABLE IF NOT EXISTS bills (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL,
  vendor TEXT,
  category TEXT,
  account_reference TEXT,
  statement_date TEXT,
  due_date TEXT,
  amount_due NUMERIC,
  minimum_payment NUMERIC,
  billing_period TEXT,
  status TEXT NOT NULL DEFAULT 'Upcoming',
  autopay_status TEXT NOT NULL DEFAULT 'Unknown',
  confidence_score NUMERIC,
  reminder_lead_days INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bills_clerk_user_id_created_at
  ON bills (clerk_user_id, created_at DESC);

-- BillSnap "email-in" transport: per-user inbound address enrollment.
-- When an owner enables email-in we generate a unique, unguessable token and
-- assign them an inbound address bills+<token>@inbound.docsnapapp.com. The
-- token is stored here scoped to the owner's clerk_user_id (unique), and the
-- provider webhook maps the `to` recipient back to the owner via the token.
-- Enabled is a soft revoke switch; deleting the row is a hard revoke
-- (fail closed: unknown/disabled tokens resolve to no owner). Lookup is by
-- token (indexed) at webhook time only.
CREATE TABLE IF NOT EXISTS billsnap_inbound_addresses (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT NOT NULL UNIQUE,
  token TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_billsnap_inbound_token
  ON billsnap_inbound_addresses (token);

-- Public marketing waitlist: email capture only, never attached to a receipt
-- owner. Duplicate emails are ignored at insert time.
CREATE TABLE IF NOT EXISTS waitlist (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- HomeSnap module: a permanent digital record of a home, organized around
-- "objects" (systems, appliances, fixtures, improvements) rather than loose
-- documents. Owner-scoped like receipts: each property belongs to one Clerk
-- user (users.clerk_user_id), and objects/documents/events hang off a property
-- via foreign keys. clerk_user_id is intentionally NULLABLE to match the
-- receipts convention (so no cross-user reads are possible — every list query
-- filters by the server-resolved owner id), and is reserved for demo rows
-- without a real owner. NOT NULL enforcement is deferred until real Clerk
-- identity exists consistently in production, same as receipts.
--
-- Date fields (purchase_date, installation_date, warranty_expiration,
-- occurred_on) are free-text TEXT to match the receipts store_date convention:
-- users type dates naturally and the app stores them verbatim rather than
-- forcing a strict locale parse.

-- A home a user owns/maintains (e.g. "Maple St House").
CREATE TABLE IF NOT EXISTS properties (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT,
  nickname TEXT NOT NULL,
  property_type TEXT NOT NULL DEFAULT 'house', -- house/condo/townhouse/apartment/other
  purchase_date TEXT,
  purchase_price NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_properties_clerk_user_id_created_at
  ON properties (clerk_user_id, created_at DESC);

-- A tracked thing in the home: an HVAC system, a stove, a door, a renovation.
-- Belongs to exactly one property. All access is mediated through the owning
-- property (and thus the owner's clerk_user_id), never straight by object id.
CREATE TABLE IF NOT EXISTS property_objects (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  object_type TEXT NOT NULL DEFAULT 'system', -- system/appliance/fixture/improvement/other
  name TEXT NOT NULL,
  manufacturer TEXT,
  model TEXT,
  serial_number TEXT,
  room_location TEXT,
  purchase_date TEXT,
  installation_date TEXT,
  purchase_price NUMERIC,
  warranty_expiration TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active/retired
  notes TEXT,
  -- Insurance category for home-inventory items (object_type 'inventory'),
  -- e.g. tv/computer/electronics/furniture/tools/jewelry. Null for all other
  -- object types; only read when object_type = 'inventory'.
  inventory_category TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_property_objects_property_id_created_at
  ON property_objects (property_id, created_at DESC);

-- Household sharing: a property owner can share a property with other DocSnap
-- users so multiple household members can view/maintain the same records.
-- grantee_user_id is the resolved DocSnap user (users.clerk_user_id) being
-- granted access; grantee_email is a snapshot of the email the owner entered
-- (kept for display even if the user later changes it). role controls write
-- access: 'view' = read-only, 'edit' = read + write. The owner always retains
-- full access; this table only ever ADDS access for named grantees, never
-- removes it. Every consumer MUST resolve a property through its owner
-- (properties.clerk_user_id) OR an active share row here — never by bare id —
-- so a non-shared user can never reach another owner's records.
CREATE TABLE IF NOT EXISTS property_shares (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  grantee_user_id TEXT NOT NULL,       -- users.clerk_user_id being granted access
  grantee_email TEXT,                  -- snapshot of the email shown to the owner
  role TEXT NOT NULL DEFAULT 'view',   -- view/edit
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (property_id, grantee_user_id)
);
CREATE INDEX IF NOT EXISTS idx_property_shares_grantee_user_id
  ON property_shares (grantee_user_id);
-- Household activity log: an append-only history of what happened to a
-- property's records and who did it — the owner or a shared household member.
-- One row is written server-side on every HomeSnap write action (object /
-- document / event / maintenance-schedule create-update-delete, maintenance
-- complete, share grant/revoke, property create). It is NEVER edited or
-- deleted on a data action — it is pure history. Columns are normalized so the
-- log can be filtered per-property (property_id + created_at index) and
-- per-object (entity_type='object' + entity_id index, no FK so an object can
-- be deleted without orphaning its history). `actor_user_id` is the
-- users.clerk_user_id who performed the action (the owner or a shared grantee);
-- the display email is resolved at read time by joining users. Read through
-- the SAME owner-or-share access boundary as every other record, so only the
-- owner and shared members can see a property's history — a non-shared user is
-- blocked (404) even guessing ids.
CREATE TABLE IF NOT EXISTS property_activity (
  id SERIAL PRIMARY KEY,
  property_id INTEGER NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  actor_user_id TEXT NOT NULL,       -- users.clerk_user_id who performed the action
  action TEXT NOT NULL,              -- created/updated/deleted/completed/shared/revoked
  entity_type TEXT NOT NULL,         -- property/object/document/event/schedule/share
  entity_id INTEGER,                 -- affected row id (null when N/A, e.g. a property)
  entity_label TEXT,                 -- human label of the affected record (name/title)
  message TEXT,                      -- human-readable description of what happened
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_property_activity_property_created
  ON property_activity (property_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_property_activity_entity
  ON property_activity (entity_type, entity_id);

-- Safe upgrade for databases created before the inventory feature existed.
ALTER TABLE property_objects ADD COLUMN IF NOT EXISTS inventory_category TEXT;

-- A receipt/invoice/warranty/manual/photo/contract attached to one object.
CREATE TABLE IF NOT EXISTS object_documents (
  id SERIAL PRIMARY KEY,
  object_id INTEGER NOT NULL REFERENCES property_objects(id) ON DELETE CASCADE,
  document_type TEXT NOT NULL DEFAULT 'other', -- receipt/invoice/warranty/manual/photo/contract/other
  title TEXT,
  file_url TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_documents_object_id_created_at
  ON object_documents (object_id, created_at DESC);

-- A timeline entry for an object: installed → serviced → repaired, etc.
-- `cost` is the optional dollar cost of the work (repair/service/install),
-- recorded by the owner for spend analytics and the home-sale/insurance
-- report. Null when the owner didn't enter a cost for this entry.
CREATE TABLE IF NOT EXISTS object_events (
  id SERIAL PRIMARY KEY,
  object_id INTEGER NOT NULL REFERENCES property_objects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'other', -- installed/serviced/repaired/other
  occurred_on TEXT,
  title TEXT,
  notes TEXT,
  cost NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_events_object_id_created_at
  ON object_events (object_id, created_at DESC);

-- Safe upgrade for databases created before the analytics feature existed:
-- adds the cost column to existing object_events tables.
ALTER TABLE object_events ADD COLUMN IF NOT EXISTS cost NUMERIC;

-- A recurring maintenance task on an object (e.g. "Main HVAC — replace filter
-- every 3 months", "Water heater — flush annually", "Smoke detectors — replace
-- batteries every 6 months"). Marks a task done sets last_done to the current
-- date and advances next_due by the interval. Date fields (last_done, next_due)
-- are free-text TEXT in yyyy-mm-dd from the date inputs, matching the repo's
-- store_date / warranty_expiration convention; interval is a positive integer
-- in a unit of days/months/years.
CREATE TABLE IF NOT EXISTS maintenance_schedules (
  id SERIAL PRIMARY KEY,
  object_id INTEGER NOT NULL REFERENCES property_objects(id) ON DELETE CASCADE,
  task_type TEXT NOT NULL DEFAULT 'other', -- filter/flush/battery/annual/inspection/clean/other
  title TEXT,
  interval_value INTEGER NOT NULL,   -- e.g. 3
  interval_unit TEXT NOT NULL DEFAULT 'months', -- days/months/years
  last_done TEXT,
  next_due TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_object_id_next_due
  ON maintenance_schedules (object_id, next_due);
CREATE INDEX IF NOT EXISTS idx_maintenance_schedules_next_due
  ON maintenance_schedules (next_due);

-- ContractSnap module: structured contract records with trust-tagged AI
-- extractions and a contract timeline.
-- Owner-scoped: each contract belongs to one Clerk user (users.clerk_user_id),
-- same convention as receipts/bills (clerk_user_id intentionally NULLABLE to
-- match the receipts convention and leave room for demo rows). All access is
-- mediated through the server-resolved owner.
--
-- Date fields (effective/expiration/renewal/cancellation_deadline) are free
-- text TEXT to match the receipts store_date convention — the AI returns dates
-- as strings and the app stores them verbatim rather than forcing a locale
-- parse. `summary` is the AI plain-language summary + extraction, stored as
-- JSONB (mirrors meeting_extractions). `analysis_status` is 'pending' when AI
-- was not connected at extract time, 'complete' otherwise.
CREATE TABLE IF NOT EXISTS contracts (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT,
  title TEXT,
  contract_type TEXT,
  effective_date TEXT,
  expiration_date TEXT,
  renewal_date TEXT,
  cancellation_deadline TEXT,
  renewal_type TEXT,           -- auto/manual/none/unknown
  auto_renewal BOOLEAN,
  status TEXT NOT NULL DEFAULT 'analyzed',
  original_file_ref TEXT,
  source_text TEXT NOT NULL DEFAULT '',
  summary JSONB NOT NULL DEFAULT '{}',
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contracts_clerk_user_id_created_at
  ON contracts (clerk_user_id, created_at DESC);

-- Detected clauses for a contract, each trust-tagged (confirmed/interpreted)
-- with a confidence score and an optional source location (section reference).
CREATE TABLE IF NOT EXISTS contract_clauses (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  text TEXT,
  location TEXT,
  confidence NUMERIC,
  source_status TEXT NOT NULL DEFAULT 'interpreted', -- confirmed/interpreted
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contract_clauses_contract_id
  ON contract_clauses (contract_id);

-- Contract timeline milestones: Signed → Effective → Cancellation Deadline →
-- Renewal → Expiration. `source` = confirmed/interpreted.
CREATE TABLE IF NOT EXISTS contract_events (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,     -- signed/effective/cancellation_deadline/renewal/expiration
  date TEXT,
  source TEXT NOT NULL DEFAULT 'interpreted',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contract_events_contract_id
  ON contract_events (contract_id);

-- Actionable reminders derived from a contract (renewal/cancellation/expiration).
CREATE TABLE IF NOT EXISTS contract_reminders (
  id SERIAL PRIMARY KEY,
  contract_id INTEGER NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  type TEXT NOT NULL,           -- renewal/cancellation/expiration
  due_date TEXT,
  delivered BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_contract_reminders_contract_id
  ON contract_reminders (contract_id);

-- GarageSnap module: workshop inventory — tools & equipment.
-- Owner-scoped like receipts/HomSnap: each item belongs to one Clerk user
-- (users.clerk_user_id, NULLABLE to match the receipts convention and leave
-- room for demo rows; every query filters by the server-resolved owner).
-- `storage_location` is the room/spot the item lives in — this is the field the
-- GarageSnap ↔ HomeSnap object-sharing maps later to HomeSnap's object
-- `room_location`. `home_object_id` is a RESERVED, nullable link to a HomeSnap
-- PropertyObject (always NULL for now; set by the sharing feature). Date
-- fields are free-text TEXT to match the receipts store_date / HomeSnap
-- warranty_expiration convention.
CREATE TABLE IF NOT EXISTS garage_items (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other', -- power_tool/hand_tool/equipment/supply/other
  make TEXT,
  model TEXT,
  serial_number TEXT,
  photo_url TEXT,
  purchase_date TEXT,
  purchase_price NUMERIC,
  warranty_expiration TEXT,
  storage_location TEXT,
  -- RESERVED for GarageSnap ↔ HomeSnap sharing: HomeSnap PropertyObject id
  -- this item mirrors. Null now; populated by the sharing feature.
  home_object_id INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_garage_items_clerk_user_id_created_at
  ON garage_items (clerk_user_id, created_at DESC);

-- BookSnap module: a personal bookshelf — books become searchable memory.
-- Owner-scoped like every other module: each book belongs to one Clerk user
-- (clerk_user_id NULLABLE to match the receipts/homSnap convention and leave
-- room for demo rows; every query filters by the server-resolved owner).
-- Provenance guardrail: `source_text` stores the book's own extracted text as
-- an immutable anchor source (the user's licensed copy, for their own use —
-- never redistributed). `original_file_ref` stores only a URL/name, never a
-- redistributable copy of the file. `tags` is JSONB (matches the contractSnap
-- JSON-payload convention and avoids TEXT[] array-literal pitfalls).
CREATE TABLE IF NOT EXISTS books (
  id SERIAL PRIMARY KEY,
  clerk_user_id TEXT,
  isbn TEXT,
  title TEXT NOT NULL,
  author TEXT,
  edition TEXT,
  publisher TEXT,
  year TEXT,
  cover_url TEXT,
  reading_status TEXT NOT NULL DEFAULT 'unread', -- unread/reading/finished
  collection TEXT,
  tags JSONB,
  original_file_ref TEXT,             -- uploaded PDF url/name only (no copy)
  source_text TEXT NOT NULL DEFAULT '', -- extracted full text (immutable source)
  page_count INTEGER,
  analysis_status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_books_clerk_user_id_created_at
  ON books (clerk_user_id, created_at DESC);

-- =========================================================================
-- BookSnap — Stage 2: page-aware read & annotate
-- -------------------------------------------------------------------------
-- `book_pages` stores immutable page anchors: each row is one concrete page
-- of text for a specific book edition. It is deliberately a SEPARATE table
-- from `books` so editing book metadata never disturbs the stored pages or
-- the annotations anchored to them. Paragraph boundaries are preserved as
-- blank lines inside `text`, so `paragraph_index` on an annotation refers to
-- the paragraph at that position in the page's text (split on blank lines).
-- Extraction is of the user's own licensed upload only — never redistributed.
-- =========================================================================
CREATE TABLE IF NOT EXISTS book_pages (
  id SERIAL PRIMARY KEY,
  book_id INT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_number INT NOT NULL,
  text TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_book_pages_book_id_page_number
  ON book_pages (book_id, page_number);

-- User annotations (highlights + notes) anchored to a concrete page +
-- paragraph. Every annotation carries book_id + page_id + paragraph_index (+
-- a page_number derived from the page) so it traces back to a concrete
-- edition + page + paragraph. Nothing is ever fabricated.
CREATE TABLE IF NOT EXISTS book_annotations (
  id SERIAL PRIMARY KEY,
  book_id INT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
  page_id INT REFERENCES book_pages(id) ON DELETE CASCADE,
  paragraph_index INT,
  quote TEXT,
  note TEXT,
  color TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_book_annotations_book_id_page_id
  ON book_annotations (book_id, page_id);
