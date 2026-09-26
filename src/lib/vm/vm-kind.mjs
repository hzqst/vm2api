/**
 * One VM holds one credential kind.
 * platform/family is the source of truth; Claude inference is rust-only.
 */

export const VM_KIND_CLAUDE = 'claude'
export const VM_KIND_CODEX = 'codex'

function labelOf(vm, key) {
  return String(vm?.[key] || '')
    .trim()
    .toLowerCase()
}

function isCodexLabel(value) {
  return value === 'openai' || value === 'codex' || value === 'gpt' || value === 'chatgpt'
}

function isClaudeLabel(value) {
  return value === 'anthropic' || value === 'claude'
}

/**
 * Resolve credential kind. Explicit platform/family/kind win.
 * Unmarked VMs fall back to legacy Codex flags, otherwise Claude.
 */
export function normalizeVmKind(vm = {}) {
  const src = vm && typeof vm === 'object' ? vm : {}
  const platform = labelOf(src, 'platform')
  const family = labelOf(src, 'family')
  const kind = labelOf(src, 'kind') || labelOf(src, 'credential_kind')
  if (isCodexLabel(platform) || isCodexLabel(family) || isCodexLabel(kind)) {
    return { platform: 'openai', family: 'codex', kind: VM_KIND_CODEX }
  }
  if (isClaudeLabel(platform) || isClaudeLabel(family) || isClaudeLabel(kind)) {
    return { platform: 'anthropic', family: 'claude', kind: VM_KIND_CLAUDE }
  }
  if (src.codex_kernel === true) return { platform: 'openai', family: 'codex', kind: VM_KIND_CODEX }
  if (labelOf(src, 'inference_engine') === 'codex') {
    return { platform: 'openai', family: 'codex', kind: VM_KIND_CODEX }
  }
  if (String(src.runtime?.codex_kernel || '').trim() === '1') {
    return { platform: 'openai', family: 'codex', kind: VM_KIND_CODEX }
  }
  return { platform: 'anthropic', family: 'claude', kind: VM_KIND_CLAUDE }
}

export function isCodexVm(vm = {}) {
  return normalizeVmKind(vm).kind === VM_KIND_CODEX
}

export function isClaudeVm(vm = {}) {
  return normalizeVmKind(vm).kind === VM_KIND_CLAUDE
}

export function stampVmKind(vm, input = vm) {
  const kind = normalizeVmKind(input)
  vm.platform = kind.platform
  vm.family = kind.family
  if (kind.kind === VM_KIND_CODEX) {
    vm.codex_kernel = true
    if (!vm.codex || typeof vm.codex !== 'object') vm.codex = {}
    delete vm.claude
  } else {
    if (!vm.claude || typeof vm.claude !== 'object') vm.claude = {}
    delete vm.codex
    delete vm.codex_kernel
  }
  return kind
}
