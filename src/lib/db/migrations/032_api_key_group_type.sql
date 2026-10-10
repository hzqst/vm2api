-- 032_api_key_group_type — which platform a managed key may schedule, and which VMs.
-- all = every schedulable VM (allowed_vms ignored). anthropic/openai require a non-empty id list.
-- Existing rows stay global.

ALTER TABLE api_keys ADD COLUMN group_type TEXT NOT NULL DEFAULT 'all';
ALTER TABLE api_keys ADD COLUMN allowed_vms TEXT NOT NULL DEFAULT '[]';
