-- 031_usage_logs_intercept — which gate blocked or released the request.
-- Null on rows written before this column. New rows store a short JSON verdict.

ALTER TABLE usage_logs ADD COLUMN intercept TEXT;
