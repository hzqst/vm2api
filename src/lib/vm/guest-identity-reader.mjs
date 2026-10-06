import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { containerName } from './vm-runtime.mjs'
import { runtimeKind } from './runtime-kind.mjs'
import { slotHost } from './slot-host.mjs'

const runFile = promisify(execFile)

// Run inside the guest: never substitute the control plane's OS or machine ID.
// NUL separators preserve whitespace and quotes without requiring jq or Node.
// Minimal images (kin-os-arch) ship without `hostname`; `uname -n` is the same nodename.
export const READ_IDENTITY = `
set -eu
if [ -r /etc/os-release ]; then . /etc/os-release; fi
host="$(hostname 2>/dev/null || uname -n)"
printf '%s\\000' "$host" "\${ID:-}" "\${PRETTY_NAME:-}" "$(uname -r)" "$(uname -m)"
printf '%s\\000' "$(cat /etc/machine-id 2>/dev/null || true)" "\${TZ:-$(cat /etc/timezone 2>/dev/null || true)}" "\${LC_ALL:-\${LANG:-}}"
`

export async function readGuestIdentity(exec, _requestPath, { timeoutMs = 5000, run = runFile } = {}) {
  const fail = (code, message) => ({ ok: false, status: 502, body: { error: { code, message } } })
  if (runtimeKind(exec?.vm) !== 'docker') {
    return fail('guest_identity_unsupported', 'Guest identity collection is not implemented for this runtime')
  }
  if (!exec?.vmId) return fail('vm_required', 'vm required')
  try {
    const env = slotHost(exec.vm).dockerEnv()
    const { stdout } = await run('docker', ['exec', containerName(exec.vmId), 'sh', '-c', READ_IDENTITY], {
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 64 * 1024,
      ...(env ? { env } : {}),
    })
    const fields = stdout.split('\0')
    if (fields.length !== 9 || fields[8] !== '' || !fields[0] || !fields[3] || !fields[4]) {
      return fail('guest_identity_invalid', 'Guest returned incomplete identity data')
    }
    const [hostname, os_id, os_pretty, kernel_release, arch, machine_id, timezone, locale] = fields
    return {
      ok: true,
      status: 200,
      body: {
        identity: {
          schema_version: '1',
          runtime_kind: 'docker',
          hostname,
          os_id,
          os_pretty,
          kernel_release,
          arch,
          machine_id,
          timezone,
          locale,
          goos: 'linux',
          collected_at: new Date().toISOString(),
        },
      },
    }
  } catch (error) {
    return fail(
      error.killed ? 'guest_identity_timeout' : 'guest_identity_exec_failed',
      String(error.stderr || error.message || error)
        .trim()
        .slice(0, 300),
    )
  }
}
