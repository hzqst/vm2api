import test from 'node:test'
import assert from 'node:assert/strict'
import {
  prepareAnthropicRequest,
  rewriteToolNames,
  restoreToolNames,
  restoreToolNamesInSSELine,
  sanitizeAnthropicBodyForBetaTokens,
  anthropicBetaTokensContains,
  CONTEXT_MANAGEMENT_BETA,
  PROMPT_CACHING_SCOPE_BETA,
  MID_CONVERSATION_SYSTEM_BETA,
  alignSamplingWithThinking,
  ensureClearThinkingContextManagement,
} from '../../src/lib/protocol/anthropic-policy.mjs'

test('request policy strips empty blocks, caps cache controls and keeps forced-tool thinking', () => {
  const body = prepareAnthropicRequest(
    {
      thinking: { type: 'enabled', budget_tokens: 1024 },
      tool_choice: { type: 'tool', name: 'run' },
      system: [
        { type: 'text', text: '', cache_control: { type: 'ephemeral', ttl: '1h' } },
        { type: 'text', text: 'system', cache_control: { type: 'ephemeral', ttl: '1h' } },
      ],
      tools: [
        { name: 'run', cache_control: { type: 'ephemeral', ttl: '1h' } },
        { name: 'read', cache_control: { type: 'ephemeral', ttl: '5m' } },
      ],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: '' },
            { type: 'text', text: 'keep', cache_control: { type: 'ephemeral', ttl: '1h' } },
            {
              type: 'tool_result',
              tool_use_id: 'toolu_1',
              content: [
                { type: 'text', text: '' },
                { type: 'text', text: 'result' },
              ],
            },
          ],
        },
      ],
    },
    { cacheControlLimit: 4 },
  )
  assert.equal(body.thinking.type, 'enabled')
  assert.equal(body.thinking.budget_tokens, 1024)
  assert.equal(body.context_management.edits[0].type, 'clear_thinking_20251015')
  assert.equal(body.system.length, 1)
  assert.equal(body.messages[0].content[0].text, 'keep')
  assert.equal(body.messages[0].content[1].content.length, 1)
  const raw = JSON.stringify(body)
  const controls = raw.match(/cache_control/g) || []
  assert.ok(controls.length <= 4)
  assert.match(raw, /"ttl":"1h"/)
})

test('zero inject billing prompt_version and leftover survive request policy', () => {
  const body = prepareAnthropicRequest({
    model: 'claude-sonnet-5',
    max_tokens: 64,
    system: [
      {
        type: 'text',
        text: "x-anthropic-billing-header: cc_version=2.1.241.abc; cc_entrypoint=sdk-cli; cch=12345; cc_prompt_id=00000000-0000-4000-8000-000000000000; prompt_version=<You are a Claude agent, built on Anthropic's Claude Agent SDK.>",
      },
      { type: 'text', text: '你是一个高速收费员。' },
    ],
    messages: [{ role: 'user', content: '你好呀。' }],
  })
  assert.equal(body.system.length, 2)
  assert.match(body.system[0].text, /prompt_version=</)
  assert.equal(body.system[1].text, '你是一个高速收费员。')
})

test('invalid tool names round-trip through response and SSE', () => {
  const original = {
    tools: [{ name: 'mcp.server/read file', input_schema: { type: 'object' } }],
    tool_choice: { type: 'tool', name: 'mcp.server/read file' },
    messages: [{ role: 'user', content: 'read' }],
  }
  const rewritten = rewriteToolNames(original)
  const upstreamName = rewritten.body.tools[0].name
  assert.match(upstreamName, /^kin_tool_/)
  assert.equal(rewritten.body.tool_choice.name, upstreamName)
  const response = restoreToolNames(
    {
      type: 'message',
      content: [{ type: 'tool_use', id: 'toolu_1', name: upstreamName, input: {} }],
    },
    rewritten.reverse,
  )
  assert.equal(response.content[0].name, 'mcp.server/read file')
  const line = restoreToolNamesInSSELine(
    `data: ${JSON.stringify({ type: 'content_block_start', content_block: { type: 'tool_use', name: upstreamName } })}`,
    rewritten.reverse,
  )
  assert.match(line, /mcp\.server\/read file/)
})

test('unsigned and empty thinking blocks are stripped before hop', () => {
  const body = prepareAnthropicRequest({
    model: 'claude-opus-5',
    thinking: { type: 'adaptive' },
    messages: [
      {
        role: 'assistant',
        content: [
          { type: 'thinking', thinking: 'keep-me', signature: 'sig_real_1234567890abcdef' },
          { type: 'thinking', thinking: 'no-sig' },
          { type: 'thinking', thinking: '', signature: 'sig_empty_text' },
          { type: 'thinking', thinking: 'dummy', signature: 'skip_thought_signature_validator' },
          { type: 'text', text: 'answer' },
        ],
      },
    ],
  })
  assert.deepEqual(body.messages[0].content, [
    { type: 'thinking', thinking: 'keep-me', signature: 'sig_real_1234567890abcdef' },
    { type: 'text', text: 'answer' },
  ])
})

test('existing context_management is not overwritten', () => {
  const body = prepareAnthropicRequest({
    model: 'claude-sonnet-5',
    thinking: { type: 'enabled', budget_tokens: 2048 },
    context_management: { edits: [{ type: 'custom_strategy' }] },
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })
  assert.equal(body.thinking.type, 'enabled')
  assert.deepEqual(body.context_management.edits, [{ type: 'custom_strategy' }])
})

test('sanitize strips context_management when final beta lacks the token', () => {
  const filled = prepareAnthropicRequest({
    model: 'claude-sonnet-5',
    thinking: { type: 'enabled', budget_tokens: 2048 },
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })
  assert.equal(filled.context_management.edits[0].type, 'clear_thinking_20251015')
  assert.equal(anthropicBetaTokensContains('oauth-2025-04-20', CONTEXT_MANAGEMENT_BETA), false)
  const stripped = sanitizeAnthropicBodyForBetaTokens(filled, 'oauth-2025-04-20,interleaved-thinking-2025-05-14')
  assert.equal(stripped.context_management, undefined)
  assert.equal(stripped.thinking.type, 'enabled')
  assert.equal(filled.context_management.edits[0].type, 'clear_thinking_20251015')
})

test('sanitize keeps context_management when final beta has the token', () => {
  const filled = prepareAnthropicRequest({
    model: 'claude-opus-5',
    thinking: { type: 'adaptive' },
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })
  const header = `oauth-2025-04-20, ${CONTEXT_MANAGEMENT_BETA} ,interleaved-thinking-2025-05-14`
  const kept = sanitizeAnthropicBodyForBetaTokens(filled, header)
  assert.equal(kept.context_management.edits[0].type, 'clear_thinking_20251015')
})

test('OAuth defaults fill missing temperature and empty tools', () => {
  const body = prepareAnthropicRequest({
    model: 'claude-haiku-4-5-20251001',
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })
  assert.equal(body.temperature, 1)
  assert.deepEqual(body.tools, [])
  assert.equal(body.tool_choice, undefined)
})

test('thinking forces temperature=1 and drops top_p/top_k', () => {
  const body = prepareAnthropicRequest({
    model: 'claude-sonnet-5',
    thinking: { type: 'adaptive' },
    temperature: 0,
    top_p: 0.9,
    top_k: 40,
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })
  assert.equal(body.temperature, 1)
  assert.equal(body.top_p, undefined)
  assert.equal(body.top_k, undefined)
  const left = alignSamplingWithThinking({ temperature: 0.2, messages: [] })
  assert.equal(left.temperature, 0.2)
})

test('sanitize is a no-op when the body has no context_management', () => {
  const body = { model: 'claude-haiku-4-5', messages: [] }
  assert.equal(sanitizeAnthropicBodyForBetaTokens(body, ''), body)
  assert.equal(sanitizeAnthropicBodyForBetaTokens(body, CONTEXT_MANAGEMENT_BETA), body)
})

test('Haiku without prompt-caching-scope drops expansion scope and keeps 1h ttl', () => {
  const body = {
    model: 'claude-haiku-4-5',
    system: [
      {
        type: 'text',
        text: 'expansion',
        cache_control: { type: 'ephemeral', ttl: '1h', scope: 'global' },
      },
    ],
  }
  const stripped = sanitizeAnthropicBodyForBetaTokens(body, 'oauth-2025-04-20,interleaved-thinking-2025-05-14')
  assert.deepEqual(stripped.system[0].cache_control, { type: 'ephemeral', ttl: '1h' })
  const kept = sanitizeAnthropicBodyForBetaTokens(body, `oauth-2025-04-20,${PROMPT_CACHING_SCOPE_BETA}`)
  assert.deepEqual(kept.system[0].cache_control, { type: 'ephemeral', ttl: '1h', scope: 'global' })
})

test('Haiku lifts messages role=system because the model rejects it', () => {
  const body = {
    model: 'claude-haiku-4-5',
    system: [{ type: 'text', text: 'billing' }],
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'system', content: 'parked leftover' },
      { role: 'assistant', content: 'ok' },
    ],
  }
  const stripped = sanitizeAnthropicBodyForBetaTokens(
    body,
    `oauth-2025-04-20,interleaved-thinking-2025-05-14,${MID_CONVERSATION_SYSTEM_BETA}`,
  )
  assert.equal(
    stripped.messages.some((message) => message.role === 'system'),
    false,
  )
  assert.equal(stripped.messages[0].content, 'hi')
  assert.equal(stripped.messages[1].content, 'ok')
  assert.equal(stripped.system.at(-1).text, 'parked leftover')
  assert.equal(body.messages[1].role, 'system')
})

test('documented models keep mid-conversation role=system; Sonnet 5 and 4.x lift it', () => {
  const header = `oauth-2025-04-20,${MID_CONVERSATION_SYSTEM_BETA}`
  const roles = (model) =>
    sanitizeAnthropicBodyForBetaTokens(
      {
        model,
        messages: [
          { role: 'user', content: 'hi' },
          { role: 'system', content: 'parked leftover' },
        ],
      },
      header,
    ).messages.map((message) => message.role)
  for (const model of [
    'claude-fable-5',
    'claude-fable-5-1',
    'claude-fable-5.1[1m]',
    'claude-mythos-5',
    'claude-mythos-5-1',
    'claude-opus-5-5',
    'claude-opus-5',
    'claude-opus-4-8',
    'claude-sonnet-5-5',
    'claude-haiku-5-5',
  ]) {
    assert.deepEqual(roles(model), ['user', 'system'], model)
  }
  for (const model of [
    'claude-sonnet-5',
    'claude-sonnet-5-fast',
    'claude-opus-4-7',
    'claude-sonnet-4-6',
    'claude-mythos-preview',
  ]) {
    assert.deepEqual(roles(model), ['user'], model)
  }
})

test('Sonnet 5.5 without mid-conversation-system beta lifts role=system', () => {
  const body = {
    model: 'claude-sonnet-5-5',
    system: [{ type: 'text', text: 'billing' }],
    messages: [
      { role: 'user', content: 'hi' },
      { role: 'system', content: 'parked leftover' },
    ],
  }
  const stripped = sanitizeAnthropicBodyForBetaTokens(body, 'oauth-2025-04-20,interleaved-thinking-2025-05-14')
  assert.equal(
    stripped.messages.some((message) => message.role === 'system'),
    false,
  )
  assert.equal(stripped.system.at(-1).text, 'parked leftover')
})

test('request policy strips OpenAI annotations on text and nested tool_result', () => {
  const body = prepareAnthropicRequest({
    model: 'claude-fable-5',
    max_tokens: 64,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'keep', annotations: [] },
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: [{ type: 'text', text: 'result', annotations: [{ type: 'url_citation' }] }],
          },
        ],
      },
    ],
  })
  assert.equal(body.messages[0].content[0].text, 'keep')
  assert.equal(body.messages[0].content[0].annotations, undefined)
  assert.equal(body.messages[0].content[1].content[0].text, 'result')
  assert.equal(body.messages[0].content[1].content[0].annotations, undefined)
  assert.ok(!JSON.stringify(body).includes('annotations'))
})

test('thinking.enabled preserves caller budget and max_tokens', () => {
  const body = prepareAnthropicRequest({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 256,
    thinking: { type: 'enabled', budget_tokens: 200 },
    messages: [{ role: 'user', content: [{ type: 'text', text: 'ok' }] }],
  })
  assert.equal(body.thinking.type, 'enabled')
  assert.equal(body.thinking.budget_tokens, 200)
  assert.equal(body.max_tokens, 256)
})

test('Haiku thinking.enabled does not inject context_management', () => {
  const body = prepareAnthropicRequest({
    model: 'claude-haiku-4-5-20251001',
    thinking: { type: 'enabled', budget_tokens: 2000 },
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })
  assert.equal(body.thinking.type, 'enabled')
  assert.equal(body.context_management, undefined)
})

test('Haiku inbound context_management is stripped', () => {
  const body = prepareAnthropicRequest({
    model: 'claude-haiku-4-5',
    thinking: { type: 'enabled', budget_tokens: 1024 },
    context_management: { edits: [{ type: 'clear_thinking_20251015', keep: 'all' }] },
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })
  assert.equal(body.context_management, undefined)
})

test('Haiku inbound context_management is stripped when thinking is off or disabled', () => {
  for (const thinking of [undefined, { type: 'disabled' }]) {
    const body = ensureClearThinkingContextManagement({
      model: 'claude-haiku-4-5-20251001',
      ...(thinking ? { thinking } : {}),
      context_management: { edits: [{ type: 'clear_thinking_20251015' }] },
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    })
    assert.equal(body.context_management, undefined, `thinking=${JSON.stringify(thinking)}`)
  }
})

test('Sonnet keeps caller context_management when thinking is off', () => {
  const edits = [{ type: 'clear_tool_uses_20250919' }]
  const body = ensureClearThinkingContextManagement({
    model: 'claude-sonnet-5',
    context_management: { edits },
    messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
  })
  assert.deepEqual(body.context_management.edits, edits)
})

test('unofficial missing thinking/effort fills official 2.1.241 defaults', () => {
  const body = prepareAnthropicRequest(
    {
      model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    },
    { unofficial: true },
  )
  assert.deepEqual(body.thinking, { type: 'adaptive', display: 'omitted' })
  assert.equal(body.output_config.effort, 'high')
  assert.deepEqual(body.context_management, {
    edits: [{ type: 'clear_thinking_20251015', keep: 'all' }],
  })
  assert.equal(body.context_management.applied_edits, undefined)
})

test('unofficial missing context_management fills official edits default', () => {
  const body = prepareAnthropicRequest(
    {
      model: 'claude-sonnet-5',
      thinking: { type: 'adaptive', display: 'omitted' },
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    },
    { unofficial: true },
  )
  assert.deepEqual(body.context_management, {
    edits: [{ type: 'clear_thinking_20251015', keep: 'all' }],
  })
  assert.equal(body.context_management.applied_edits, undefined)
})

test('unofficial does not overwrite caller context_management', () => {
  const body = prepareAnthropicRequest(
    {
      model: 'claude-sonnet-5',
      thinking: { type: 'adaptive', display: 'omitted' },
      context_management: { edits: [{ type: 'custom_strategy' }] },
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    },
    { unofficial: true },
  )
  assert.deepEqual(body.context_management.edits, [{ type: 'custom_strategy' }])
})

test('unofficial Haiku without thinking does not inject context_management', () => {
  const body = prepareAnthropicRequest(
    {
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    },
    { unofficial: true },
  )
  assert.equal(body.thinking, undefined)
  assert.equal(body.context_management, undefined)
})

test('unofficial filled context_management is stripped when final beta lacks the token', () => {
  const filled = prepareAnthropicRequest(
    {
      model: 'claude-sonnet-5',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    },
    { unofficial: true },
  )
  assert.equal(filled.context_management.edits[0].type, 'clear_thinking_20251015')
  const stripped = sanitizeAnthropicBodyForBetaTokens(filled, 'oauth-2025-04-20,interleaved-thinking-2025-05-14')
  assert.equal(stripped.context_management, undefined)
})

test('unofficial fills omitted when caller thinking has no display', () => {
  const body = prepareAnthropicRequest(
    {
      model: 'claude-sonnet-5',
      thinking: { type: 'adaptive' },
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    },
    { unofficial: true },
  )
  assert.deepEqual(body.thinking, { type: 'adaptive', display: 'omitted' })
})

test('beta sanitize rewrites thinking.display updates only without the gate token', () => {
  const updates = { model: 'claude-opus-5-5', thinking: { type: 'adaptive', display: 'updates' } }
  const dropped = sanitizeAnthropicBodyForBetaTokens(updates, 'oauth-2025-04-20,interleaved-thinking-2025-05-14')
  assert.deepEqual(dropped.thinking, { type: 'adaptive', display: 'omitted' })
  const kept = sanitizeAnthropicBodyForBetaTokens(updates, 'oauth-2025-04-20,thinking-display-updates-2026-08-18')
  assert.equal(kept.thinking.display, 'updates')
  const summarized = sanitizeAnthropicBodyForBetaTokens(
    { thinking: { type: 'adaptive', display: 'summarized' } },
    'oauth-2025-04-20',
  )
  assert.equal(summarized.thinking.display, 'summarized')
  const omitted = sanitizeAnthropicBodyForBetaTokens({ thinking: { type: 'adaptive', display: 'omitted' } }, '')
  assert.equal(omitted.thinking.display, 'omitted')
  const spaced = sanitizeAnthropicBodyForBetaTokens(updates, 'oauth-2025-04-20, thinking-display-updates-2026-08-18 ')
  assert.equal(spaced.thinking.display, 'updates')
})

test('unofficial does not overwrite caller thinking display, effort, or max_tokens', () => {
  const body = prepareAnthropicRequest(
    {
      model: 'claude-sonnet-5',
      max_tokens: 4096,
      thinking: { type: 'enabled', budget_tokens: 2048, display: 'summarized' },
      output_config: { effort: 'medium' },
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    },
    { unofficial: true },
  )
  assert.equal(body.thinking.type, 'enabled')
  assert.equal(body.thinking.budget_tokens, 2048)
  assert.equal(body.thinking.display, 'summarized')
  assert.equal(body.output_config.effort, 'medium')
  assert.equal(body.max_tokens, 4096)
})

test('unofficial Haiku does not invent adaptive thinking', () => {
  const body = prepareAnthropicRequest(
    {
      model: 'claude-haiku-4-5',
      messages: [{ role: 'user', content: [{ type: 'text', text: 'hi' }] }],
    },
    { unofficial: true },
  )
  assert.equal(body.thinking, undefined)
  assert.equal(body.output_config?.effort, undefined)
})

test('valid unique tool names are not changed', () => {
  const result = rewriteToolNames({
    tools: [{ name: 'read_file' }, { name: 'write_file' }],
  })
  assert.deepEqual(
    result.body.tools.map((tool) => tool.name),
    ['read_file', 'write_file'],
  )
})

test('native Messages image_url parts become Claude image blocks', () => {
  const body = prepareAnthropicRequest({
    model: 'claude-fable-5',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'look' },
          { type: 'image_url', image_url: { url: 'data:image/png;base64,AAAB' } },
          { type: 'image_url', image_url: 'https://example.com/a.png' },
        ],
      },
    ],
  })
  const [text, inline, remote] = body.messages[0].content
  assert.equal(text.type, 'text')
  assert.deepEqual(inline, {
    type: 'image',
    source: { type: 'base64', media_type: 'image/png', data: 'AAAB' },
  })
  assert.deepEqual(remote, {
    type: 'image',
    source: { type: 'url', url: 'https://example.com/a.png' },
  })
})

test('image_url normalize reaches tool_result content and keeps cache_control', () => {
  const body = prepareAnthropicRequest({
    model: 'claude-fable-5',
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_1',
            content: [
              {
                type: 'image_url',
                image_url: { url: 'data:image/webp;base64,BBBC' },
                cache_control: { type: 'ephemeral' },
              },
            ],
          },
        ],
      },
    ],
  })
  assert.deepEqual(body.messages[0].content[0].content[0], {
    type: 'image',
    source: { type: 'base64', media_type: 'image/webp', data: 'BBBC' },
    cache_control: { type: 'ephemeral' },
  })
})

test('already-Claude image blocks and unusable image_url parts pass through', () => {
  const source = { type: 'base64', media_type: 'image/jpeg', data: 'CCCD' }
  const body = prepareAnthropicRequest({
    model: 'claude-fable-5',
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source },
          { type: 'image_url', image_url: {} },
        ],
      },
    ],
  })
  assert.deepEqual(body.messages[0].content[0], { type: 'image', source })
  assert.deepEqual(body.messages[0].content[1], { type: 'image_url', image_url: {} })
})
