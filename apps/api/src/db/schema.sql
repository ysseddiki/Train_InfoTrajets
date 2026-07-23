-- SNCF-Alerts schema v1

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS admin_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id UUID NOT NULL REFERENCES admin_accounts(id) ON DELETE CASCADE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sessions_expires_idx ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS journeys (
  direction TEXT PRIMARY KEY CHECK (direction IN ('outbound', 'inbound')),
  label TEXT NOT NULL,
  origin_id TEXT NOT NULL DEFAULT '',
  destination_id TEXT NOT NULL DEFAULT '',
  origin_label TEXT NOT NULL DEFAULT '',
  destination_label TEXT NOT NULL DEFAULT '',
  network TEXT NOT NULL DEFAULT 'transilien',
  days_of_week INT[] NOT NULL DEFAULT '{1,2,3,4,5}',
  window_start TEXT NOT NULL DEFAULT '07:00',
  window_end TEXT NOT NULL DEFAULT '09:30',
  min_delay_minutes INT NOT NULL DEFAULT 10,
  severities TEXT[] NOT NULL DEFAULT '{delay,cancellation}',
  active BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS recipients (
  email TEXT PRIMARY KEY
);

CREATE TABLE IF NOT EXISTS disruption_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_event_id TEXT NOT NULL UNIQUE,
  direction TEXT CHECK (direction IS NULL OR direction IN ('outbound', 'inbound')),
  kind TEXT NOT NULL,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  delay_minutes INT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  source TEXT NOT NULL DEFAULT 'stub',
  detected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS disruption_events_detected_idx ON disruption_events (detected_at DESC);

CREATE TABLE IF NOT EXISTS alert_deliveries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID REFERENCES disruption_events(id) ON DELETE SET NULL,
  direction TEXT CHECK (direction IS NULL OR direction IN ('outbound', 'inbound')),
  channel TEXT NOT NULL CHECK (channel IN ('email', 'teams')),
  status TEXT NOT NULL CHECK (status IN ('queued', 'sent', 'failed', 'suppressed')),
  detail TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS alert_deliveries_created_idx ON alert_deliveries (created_at DESC);

CREATE TABLE IF NOT EXISTS app_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
