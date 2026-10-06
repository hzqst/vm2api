-- 029_usage_logs_outbound_session — the session id actually sent upstream.
--
-- session_id (027) is what the caller sent; under the default `rebuild`
-- outbound mode the gateway mints a different id per account/bind epoch, so
-- the caller value does not identify the upstream conversation. The log page
-- displays, groups and suggests by outbound_session_id; the session filter
-- matches either column. Historical rows stay NULL.

ALTER TABLE usage_logs ADD COLUMN outbound_session_id TEXT;

CREATE INDEX IF NOT EXISTS idx_usage_logs_outbound_session_created ON usage_logs(outbound_session_id, created_at);
