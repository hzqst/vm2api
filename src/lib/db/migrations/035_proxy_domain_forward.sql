-- 035_proxy_domain_forward — opt-in hostname SOCKS CONNECT for one outlet.
-- Default 0 keeps today's literal original-destination behavior.
-- kin-egress reads it from egress.json; the column is only the operator switch.

ALTER TABLE proxies ADD COLUMN domain_forward INTEGER NOT NULL DEFAULT 0;
