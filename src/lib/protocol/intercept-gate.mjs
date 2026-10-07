/**
 * One pre-hop gate for /v1 and count_tokens.
 *
 * Order matches sub2api content-moderation Check: cheap hard rules, then the
 * persisted refusal/device cache, then the model. A block never hops.
 * Device bans and refusal rows are written here so both entry points share them.
 */
import { detectDistill, distillBlockError } from '../core/distill-detect.mjs'
import {
  inboundRefusalDeviceId,
  matchStoredRefusal,
  refusalFingerprint,
  refusalGuardError,
  refusalPreview,
  refusalPromptSignature,
} from '../core/refusal-guard.mjs'
import { RefusalDeviceBlocksRepo } from '../db/repos/refusal-device-blocks-repo.mjs'
import { classifyJev, jevDocument, matchHardPolicy, policyBlockError } from './jev-intercept.mjs'
import { prepareInterceptText } from './jev-prepare.mjs'

function deviceStore(devices) {
  if (devices) return devices
  try {
    return new RefusalDeviceBlocksRepo()
  } catch {
    return null
  }
}

function similarityRatio(value) {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return 0.9
  return n > 1 ? n / 100 : n
}

export function commitProtocolBlock(decision, { repo, devices, policy, requestId } = {}) {
  if (!decision || decision.action !== 'block') return
  if (decision.kind === 'device') {
    try {
      devices?.hit?.(decision.deviceId)
    } catch {
      /* counter is best-effort */
    }
    return
  }
  if ((decision.kind === 'exact' || decision.kind === 'similar') && decision.fingerprint) {
    try {
      repo?.hit?.(decision.fingerprint)
    } catch {
      /* counter is best-effort */
    }
  }
  if (decision.remember && policy?.enabled && repo && decision.fingerprint) {
    try {
      repo.remember?.({
        fingerprint: decision.fingerprint,
        model: decision.model || '',
        requestId: requestId || null,
        errorMessage: decision.errorMessage || null,
        preview: decision.preview || null,
        expiresAt: null,
        signature: decision.signature || null,
      })
    } catch {
      /* the response still must not hop */
    }
  }
  if (!decision.banDevice || !policy?.enabled || !policy?.device_block_enabled || !decision.deviceId) return
  try {
    deviceStore(devices)?.block?.({
      deviceId: decision.deviceId,
      requestId: requestId || null,
      fingerprint: decision.fingerprint || null,
      reason: decision.reason || decision.kind,
    })
  } catch {
    /* the prompt block still stands */
  }
}

function pass() {
  return { action: 'pass' }
}

function block(fields) {
  return { action: 'block', ...fields }
}

/**
 * Does not write. `commitProtocolBlock` applies hit / remember / device ban.
 */
export async function evaluateProtocolIntercept({
  inbound,
  body = inbound,
  headers,
  official = false,
  zeroInject = false,
  distillRules,
  policy,
  jev,
  repo,
  devices,
  requestId,
  fetchImpl,
} = {}) {
  const distill = detectDistill({ inbound, body, official, zeroInject }, distillRules)
  if (distill.action === 'block') {
    const evidence = (distill.hits || [])
      .map((item) => item.evidence || item.rule)
      .filter(Boolean)
      .join(';')
    return block({
      kind: 'distill',
      via: 'distill-detect',
      final_state: 'distill_blocked',
      error: distillBlockError(distillRules, requestId),
      errorMessage: evidence ? `${distill.error?.message || '不允许蒸馏'}: ${evidence}` : distill.error?.message,
      deviceId: inboundRefusalDeviceId({ inbound, body, headers }),
      fingerprint: refusalFingerprint(body, inbound),
      banDevice: true,
      remember: false,
      reason: 'distill',
    })
  }

  const document = prepareInterceptText(jevDocument(inbound, body), {
    stripReminders: jev?.strip_reminders !== false,
    expandBase64: jev?.expand_base64 !== false,
  })
  if (jev?.hard_regex_enabled !== false) {
    const hard = matchHardPolicy(document, jev?.patterns)
    if (hard) {
      const error = policyBlockError(requestId)
      return block({
        kind: 'hard_regex',
        via: 'hard-regex',
        final_state: 'policy_blocked',
        error,
        errorMessage: `${error.body?.error?.message}: ${hard.category}`,
        category: hard.category,
        deviceId: inboundRefusalDeviceId({ inbound, body, headers }),
        fingerprint: refusalFingerprint(body, inbound),
        signature: refusalPromptSignature(inbound, body),
        model: body?.model || inbound?.model || '',
        preview: refusalPreview(body, inbound),
        banDevice: true,
        remember: true,
        reason: `hard_regex:${hard.category}`,
      })
    }
  }

  if (policy?.enabled && repo && typeof repo.get === 'function') {
    const match = matchStoredRefusal({
      inbound,
      body,
      headers,
      repo,
      devices,
      similarityEnabled: policy.similarity_enabled,
      similarity: similarityRatio(policy.similarity),
      deviceBlockEnabled: policy.device_block_enabled,
    })
    if (match) {
      const error = refusalGuardError(requestId)
      return block({
        kind: match.kind,
        via: 'refusal-guard',
        final_state:
          match.kind === 'device' ? 'refusal_device' : match.kind === 'similar' ? 'refusal_similar' : 'refusal_guard',
        error,
        errorMessage: error.body?.error?.message,
        deviceId: match.deviceId,
        fingerprint: match.fingerprint,
        banDevice: match.kind !== 'device',
        remember: false,
        reason: match.kind === 'similar' ? 'refusal_similar' : 'refusal_guard',
      })
    }
  }

  if (jev?.enabled) {
    const verdict = await classifyJev(document, jev, fetchImpl)
    if (verdict.action === 'block') {
      const error = policyBlockError(requestId)
      return block({
        kind: 'jev',
        via: 'jev',
        final_state: 'policy_blocked',
        error,
        errorMessage: `${error.body?.error?.message}: ${verdict.category}`,
        category: verdict.category,
        deviceId: inboundRefusalDeviceId({ inbound, body, headers }),
        fingerprint: refusalFingerprint(body, inbound),
        signature: refusalPromptSignature(inbound, body),
        model: body?.model || inbound?.model || '',
        preview: refusalPreview(body, inbound),
        banDevice: true,
        remember: true,
        reason: `jev:${verdict.category}`,
      })
    }
  }

  return pass()
}

/** Block decision after side effects, or null when the request may hop. */
export async function runProtocolIntercept(ctx = {}) {
  const decision = await evaluateProtocolIntercept(ctx)
  if (decision.action !== 'block') return null
  commitProtocolBlock(decision, ctx)
  return decision
}
