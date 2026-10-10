-- 034_vm_pools — reusable named slot pools for managed API keys.
-- A slot belongs to at most one pool. Keys store vm_pool_id; membership is
-- read live so a roster change applies to the next request, including sticky.
-- Unset vm_pool_id keeps the existing group_type / allowed_vms behavior.
-- Deleting a pool that keys still reference is rejected in the service layer:
-- nulling the column would widen those keys to the global pool.

CREATE TABLE IF NOT EXISTS vm_pools (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vm_pools_name ON vm_pools(name);

CREATE TABLE IF NOT EXISTS vm_pool_members (
  pool_id TEXT NOT NULL,
  vm_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (pool_id, vm_id),
  FOREIGN KEY (pool_id) REFERENCES vm_pools(id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_vm_pool_members_vm ON vm_pool_members(vm_id);

ALTER TABLE api_keys ADD COLUMN vm_pool_id TEXT;
