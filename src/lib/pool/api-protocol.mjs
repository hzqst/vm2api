import { officialMessagesBody } from '../protocol/anthropic-messages.mjs'
import { forwardApi, readApiJson } from '../transport/api-kernel-client.mjs'
import { messagesUrl, normalizeProtocol, resolvePreset, responsesUrl, upstreamAuthHeaders } from './api-presets.mjs'
import { claudeToOpenAIResponsesRequest } from './api-openai.mjs'
import {
  assembleCodexBodyFromSse,
  codexBodyToAnthropicMessage,
  createAnthropicSseState,
  responsesSseToAnthropicEvents,
  responsesSseToChatChunk,
} from '../protocol/codex-convert.mjs'
import { usageFromSseLine } from '../protocol/handle-codex.mjs'

export function resolveInferenceBackend(req) {
  if (req?.apiKeyKind === 'managed') {
    return String(req.apiKeyRecord?.category || 'oauth').toLowerCase() === 'api' ? 'api' : 'oauth'
  }
  if (req?.apiKeyKind === 'master') {
    return String(req.headers?.['x-kin-backend'] || '').toLowerCase() === 'api' ? 'api' : 'oauth'
  }
  return 'oauth'
}

export { messagesUrl, responsesUrl } from './api-presets.mjs'

function joinHeaderMap(headers = {}) {
  const out = {}
  for (const [k, v] of Object.entries(headers)) {
    if (v == null || v === '') continue
    out[k] = String(v)
  }
  return out
}

async function readLines(stream, onLine) {
  let buf = ''
  for await (const chunk of stream) {
    buf += chunk.toString('utf8')
    let idx
    while ((idx = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, idx)
      buf = buf.slice(idx + 1)
      await onLine(line)
    }
  }
  if (buf) await onLine(buf)
}

export async function runApiInference({
  req,
  res,
  cfg,
  scheduler,
  store,
  protocol,
  inbound,
  convertedBody,
  clientStream,
  deliveryMode,
  signal,
  timeoutMs,
  personaHideTokens,
  cacheTtl,
  converters,
} = {}) {
  const canonical = officialMessagesBody(convertedBody)
  const model = canonical.model
  const picked = scheduler.pick(model)
  if (!picked.ok) {
    return {
      ok: false,
      status: picked.code === 'model_not_found' ? 404 : 503,
      via: 'api-kernel',
      body: { type: 'error', error: { type: 'api_error', code: picked.code, message: picked.message } },
      terminalState: 'exhausted',
    }
  }

  const preset = resolvePreset(picked.endpoint.kind, picked.endpoint)
  const protocolKind = normalizeProtocol(picked.endpoint.protocol || preset.protocol, preset.kind)
  const extraHeaders = joinHeaderMap(picked.endpoint.headers)
  const isOpenAI = protocolKind === 'openai'
  const body = isOpenAI
    ? { ...claudeToOpenAIResponsesRequest({ ...canonical, model: picked.upstream_model }), stream: true }
    : { ...canonical, model: picked.upstream_model, stream: true }
  const headers = {
    'content-type': 'application/json',
    accept: 'text/event-stream',
    ...upstreamAuthHeaders(protocolKind, picked.key.api_key, {
      ...extraHeaders,
      auth_scheme: picked.endpoint.auth_scheme || extraHeaders.auth_scheme || extraHeaders.anthropic_apikey_auth_scheme,
    }),
  }

  let upstream
  try {
    upstream = await forwardApi({
      cfg,
      url: isOpenAI ? responsesUrl(preset.base_url) : messagesUrl(preset.base_url),
      headers,
      body,
      proxyUrl: picked.key.proxy_url,
      signal,
      timeoutMs,
    })
  } catch (error) {
    return {
      ok: false,
      status: 502,
      via: 'api-kernel',
      body: {
        type: 'error',
        error: {
          type: 'api_error',
          code: error.code || 'api_kernel_transport',
          message: String(error.message || error).slice(0, 300),
        },
      },
      terminalState: 'transport_error',
      transportError: true,
    }
  }

  const status = Number(upstream.statusCode) || 502
  if (status === 429 && !picked.endpoint.disable_cooling) {
    const retry = Number(upstream.headers['retry-after'] || 30)
    const until = new Date(Date.now() + Math.max(1, retry) * 1000).toISOString()
    try {
      store.setKeyCooldown(picked.key.id, until)
    } catch {}
    scheduler.reload(store.listRaw())
  }

  const resultBase = {
    ok: status >= 200 && status < 300,
    status,
    via: 'api-kernel',
    vmId: null,
    accountId: picked.key.id,
    endpointId: picked.endpoint.id,
    model: picked.upstream_model,
    headers: { ...upstream.headers },
  }

  if (status >= 400) {
    const payload = await readApiJson(upstream).catch(() => ({}))
    const message = payload?.error?.message || payload?.message || `upstream ${status}`
    return {
      ...resultBase,
      ok: false,
      body: { type: 'error', error: { type: 'api_error', message: String(message).slice(0, 300) } },
      terminalState: 'rejected',
    }
  }

  if (isOpenAI) {
    return await runOpenAIResponsesUpstream({
      upstream,
      resultBase,
      protocol,
      inbound,
      clientStream,
      deliveryMode,
      res,
      converters,
      body,
    })
  }

  if (!clientStream) {
    const assembler = converters.createClaudeMessageAssembler()
    let committed = false
    await readLines(upstream, async (line) => {
      applyMaybeUsageHide(line, personaHideTokens, cacheTtl, converters)
      converters.applyClaudeSSELineToMessage(line, assembler)
      if (!committed && String(line).startsWith('data:')) committed = true
    })
    return {
      ...resultBase,
      ok: resultBase.ok && !!assembler.message,
      body: assembler.message || assembler.error || { type: 'error', error: { message: 'empty api upstream' } },
      usage: assembler.message?.usage || null,
      terminalState: resultBase.ok ? 'verified' : 'rejected',
      committed,
    }
  }

  let state
  if (protocol === 'openai.chat')
    state = converters.createOpenAIChatStreamState(inbound.model || body.model, picked.endpoint.id)
  else if (protocol === 'openai.completions')
    state = converters.createOpenAICompletionStreamState(inbound.model || body.model, picked.endpoint.id)
  else if (protocol === 'openai.responses')
    state = converters.createResponsesStreamState(inbound.model || body.model, picked.endpoint.id)

  let committed = false
  let sawStop = false
  const started = Date.now()
  let ttftMs = null
  await readLines(upstream, async (line) => {
    if (personaHideTokens) line = converters.hidePersonaUsageInSseLine(line, personaHideTokens, cacheTtl) || line
    if (String(line).startsWith('data:') && ttftMs == null) ttftMs = Date.now() - started
    if (String(line).includes('message_stop')) sawStop = true
    if (!committed && String(line).startsWith('data:')) {
      committed = true
      if (protocol === 'anthropic.messages' && !res.headersSent) converters.writeSSEHeaders(res)
    }
    if (protocol === 'anthropic.messages') {
      if (!res.headersSent) converters.writeSSEHeaders(res)
      res.write(String(line).endsWith('\n') ? String(line) : `${line}\n`)
      return
    }
    const writeChunks = (chunks) => {
      if (!chunks.length) return
      if (!res.headersSent) converters.writeSSEHeaders(res)
      for (const chunk of chunks) res.write(`data: ${JSON.stringify(chunk)}\n\n`)
    }
    if (protocol === 'openai.chat') writeChunks(converters.claudeSSELineToOpenAIChatChunks(line, state))
    else if (protocol === 'openai.completions')
      writeChunks(converters.claudeSSELineToOpenAICompletionChunks(line, state))
    else writeChunks(converters.claudeSSELineToResponsesEvents(line, state))
  })

  return {
    ...resultBase,
    ok: resultBase.ok && (deliveryMode !== 'verified' || sawStop),
    terminalState: sawStop ? 'verified' : committed ? 'incomplete' : 'rejected',
    committed,
    ttftMs,
  }
}

async function runOpenAIResponsesUpstream({
  upstream,
  resultBase,
  protocol,
  inbound,
  clientStream,
  deliveryMode,
  res,
  converters,
  body,
}) {
  const chunks = []
  const anthropicSse = protocol === 'anthropic.messages' ? createAnthropicSseState() : null
  let committed = false
  let completed = false
  let ttftMs = null
  let streamedUsage = null
  const started = Date.now()

  await readLines(upstream, async (line) => {
    const raw = String(line || '')
    const seen = usageFromSseLine(raw)
    if (seen) streamedUsage = seen
    if (raw.startsWith('data:') && ttftMs == null) ttftMs = Date.now() - started
    if (!committed && raw.startsWith('data:')) committed = true
    if (!clientStream) {
      chunks.push(raw)
      return
    }
    if (!res.headersSent) converters.writeSSEHeaders(res)
    if (protocol === 'openai.responses') {
      res.write(raw.endsWith('\n') ? raw : `${raw}\n`)
      if (/response\.(completed|done)/.test(raw)) completed = true
      return
    }
    if (protocol === 'openai.chat' || protocol === 'openai.completions') {
      const mapped = responsesSseToChatChunk(raw)
      if (mapped) {
        res.write(mapped)
        if (mapped.includes('[DONE]')) completed = true
      }
      return
    }
    const mapped = responsesSseToAnthropicEvents(raw, anthropicSse)
    if (mapped) {
      res.write(mapped)
      if (mapped.includes('message_stop')) completed = true
    }
  })

  if (!clientStream) {
    const assembled = assembleCodexBodyFromSse(chunks, {})
    const outBody =
      protocol === 'anthropic.messages'
        ? codexBodyToAnthropicMessage(assembled, inbound?.model || body?.model)
        : assembled
    return {
      ...resultBase,
      ok: resultBase.ok && !!(assembled && (assembled.output || assembled.id || outBody)),
      body: outBody,
      usage: assembled?.usage || streamedUsage || outBody?.usage || null,
      terminalState: resultBase.ok ? 'verified' : 'rejected',
      committed: true,
    }
  }

  return {
    ...resultBase,
    ok: resultBase.ok && (deliveryMode !== 'verified' || completed || committed),
    usage: streamedUsage,
    terminalState: completed ? 'verified' : committed ? 'incomplete' : 'rejected',
    committed,
    ttftMs,
  }
}

function applyMaybeUsageHide() {}
