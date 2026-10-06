-- 027_usage_logs_session_effort — caller session + requested reasoning effort.
--
-- session_id:       caller-side conversation id (Claude Code metadata.user_id
--                   session, x-claude-code-session-id, Codex session header …),
--                   truncated; lets the log page filter/group one conversation.
-- reasoning_effort: inbound effort normalized to none|minimal|auto|low|medium|
--                   high|xhigh|max; NULL when absent or unrecognized.
-- Historical rows stay NULL.

ALTER TABLE usage_logs ADD COLUMN session_id TEXT;
ALTER TABLE usage_logs ADD COLUMN reasoning_effort TEXT;

CREATE INDEX IF NOT EXISTS idx_usage_logs_session_created ON usage_logs(session_id, created_at);
