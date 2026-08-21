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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

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

-- Public marketing waitlist: email capture only, never attached to a receipt
-- owner. Duplicate emails are ignored at insert time.
CREATE TABLE IF NOT EXISTS waitlist (
  id SERIAL PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
