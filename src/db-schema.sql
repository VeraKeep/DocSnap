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
CREATE TABLE IF NOT EXISTS object_events (
  id SERIAL PRIMARY KEY,
  object_id INTEGER NOT NULL REFERENCES property_objects(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL DEFAULT 'other', -- installed/serviced/repaired/other
  occurred_on TEXT,
  title TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_object_events_object_id_created_at
  ON object_events (object_id, created_at DESC);

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
