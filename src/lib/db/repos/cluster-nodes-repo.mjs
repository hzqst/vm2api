/**
 * cluster_nodes repository — SSH-reachable VPS nodes.
 * Credentials are encrypted at rest via maybeEncrypt and never leave through
 * `list()` / `get()`; only `getSecrets()` returns them, for the connector.
 */

import { getDb } from '../database.mjs'
import { maybeDecrypt, maybeEncrypt } from '../secure.mjs'

const PUBLIC_COLUMNS = [
  'id',
  'label',
  'host',
  'port',
  'username',
  'auth_type',
  'host_key_alg',
  'host_key_sha256',
  'jump_node_id',
  'created_at',
  'updated_at',
]

export class ClusterNodesRepo {
  constructor(db = getDb()) {
    this.db = db
    this._list = db.prepare(`SELECT ${PUBLIC_COLUMNS.join(', ')} FROM cluster_nodes ORDER BY created_at, id`)
    this._get = db.prepare(`SELECT ${PUBLIC_COLUMNS.join(', ')} FROM cluster_nodes WHERE id = ?`)
    this._secrets = db.prepare('SELECT password, private_key, passphrase FROM cluster_nodes WHERE id = ?')
    this._findEndpoint = db.prepare('SELECT id FROM cluster_nodes WHERE host = ? AND port = ? AND username = ?')
    this._dependents = db.prepare('SELECT id FROM cluster_nodes WHERE jump_node_id = ?')
    this._insert = db.prepare(`
      INSERT INTO cluster_nodes (id, label, host, port, username, auth_type, password, private_key, passphrase,
        host_key_alg, host_key_sha256, jump_node_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    this._remove = db.prepare('DELETE FROM cluster_nodes WHERE id = ?')
  }

  list() {
    return this._list.all().map((row) => ({ ...row }))
  }

  get(id) {
    const row = this._get.get(id)
    return row ? { ...row } : null
  }

  findByEndpoint(host, port, username) {
    return this._findEndpoint.get(host, port, username)?.id || null
  }

  dependentsOf(id) {
    return this._dependents.all(id).map((row) => row.id)
  }

  getSecrets(id) {
    const row = this._secrets.get(id)
    if (!row) return null
    return {
      password: maybeDecrypt(row.password),
      privateKey: maybeDecrypt(row.private_key),
      passphrase: maybeDecrypt(row.passphrase),
    }
  }

  insert(node, now = new Date().toISOString()) {
    this._insert.run(
      node.id,
      node.label,
      node.host,
      node.port,
      node.username,
      node.auth_type,
      maybeEncrypt(node.password ?? null),
      maybeEncrypt(node.private_key ?? null),
      maybeEncrypt(node.passphrase ?? null),
      node.host_key_alg,
      node.host_key_sha256,
      node.jump_node_id ?? null,
      now,
      now,
    )
    return this.get(node.id)
  }

  remove(id) {
    return this._remove.run(id).changes > 0
  }
}
