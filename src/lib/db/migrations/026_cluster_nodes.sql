-- 026_cluster_nodes — remote VPS reached over SSH from this control plane.
--
-- host_key_sha256 is pinned at join time (TOFU after the operator confirms the
-- probed fingerprint); a mismatch refuses the connection.
-- password / private_key / passphrase go through maybeEncrypt.
-- jump_node_id chains through another node (ProxyJump) for hosts behind NAT.

CREATE TABLE IF NOT EXISTS cluster_nodes (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL DEFAULT 22,
  username TEXT NOT NULL,
  auth_type TEXT NOT NULL CHECK (auth_type IN ('key', 'password')),
  password TEXT,
  private_key TEXT,
  passphrase TEXT,
  host_key_alg TEXT NOT NULL,
  host_key_sha256 TEXT NOT NULL,
  jump_node_id TEXT REFERENCES cluster_nodes(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cluster_nodes_endpoint
  ON cluster_nodes (host, port, username);
