import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createPanelHandler } from '../../src/lib/admin/panel-routes.mjs'

function writeCodexVm(root, id) {
  const vmsDir = path.join(root, 'vms')
  fs.mkdirSync(path.join(vmsDir, id), { recursive: true })
  const file = path.join(vmsDir, `${id}.json`)
  fs.writeFileSync(
    file,
    JSON.stringify({
      id,
      name: id,
      status: 'stopped',
      platform: 'openai',
      family: 'codex',
      codex_kernel: true,
      codex: {},
      schedulable: false,
      schedule_disabled_reason: 'no_credential',
      proxy: null,
    }),
  )
  return file
}

function makeImportHandler(project, body) {
  const response = {}
  const handlePanel = createPanelHandler({
    cfg: { paths: { project } },
    requireAuth(req) {
      req.apiKeyKind = 'master'
      req.panelRole = 'admin'
      return true
    },
    json(_res, status, payload) {
      response.status = status
      response.body = payload
      return true
    },
    readBody: async () => body,
  })
  return { handlePanel, response }
}

test('importing a Codex credential turns scheduling on', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kin-codex-import-'))
  try {
    const vmPath = writeCodexVm(root, 'vm-codex-01')
    const { handlePanel, response } = makeImportHandler(root, {
      vm_id: 'vm-codex-01',
      auth_json: {
        access_token: 'at-test',
        refresh_token: 'rt-test',
        email: 'codex@example.com',
      },
    })
    const handled = await handlePanel({ method: 'POST' }, {}, new URL('http://localhost/api/panel/vms/import'))
    assert.equal(handled, true)
    assert.equal(response.status, 200, response.body?.error?.message || JSON.stringify(response.body))
    const saved = JSON.parse(fs.readFileSync(vmPath, 'utf8'))
    assert.equal(saved.codex.has_access, true)
    assert.equal(saved.schedulable, true)
    assert.equal(saved.schedule_disabled_reason, null)
  } finally {
    fs.rmSync(root, { recursive: true, force: true })
  }
})
