-- 030_refusal_near — near-duplicate prompt signatures and inbound device bans.
-- signature is a MinHash of user text. device blocks are permanent.

ALTER TABLE refusal_guards ADD COLUMN signature TEXT;

CREATE TABLE IF NOT EXISTS refusal_device_blocks (
  device_id TEXT PRIMARY KEY,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  hit_count INTEGER NOT NULL DEFAULT 0,
  source_request_id TEXT,
  fingerprint TEXT,
  reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_refusal_device_last_seen ON refusal_device_blocks(last_seen_at);
