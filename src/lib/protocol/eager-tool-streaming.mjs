/**
 * Panel opt-in (routing failover.eager_tool_streaming): mark every custom tool
 * eager_input_streaming, the shape official Claude Code sends when its
 * fine-grained tool streaming is on. Without it upstream buffers a whole Write
 * content and stays silent for minutes, which trips the stream idle limit.
 * Official Claude Code only enables it on a first-party base URL, so relayed
 * clients never send it. Server tools are left alone; a caller's own boolean wins.
 */
export function eagerToolStreamingEnabled(routing) {
  return routing?.failover?.eager_tool_streaming === true
}

export function applyEagerToolStreaming(body, routing) {
  if (!eagerToolStreamingEnabled(routing) || !Array.isArray(body?.tools)) return body
  let changed = false
  const tools = body.tools.map((tool) => {
    if (!tool || typeof tool !== 'object' || !tool.input_schema) return tool
    if (typeof tool.eager_input_streaming === 'boolean') return tool
    changed = true
    return { ...tool, eager_input_streaming: true }
  })
  return changed ? { ...body, tools } : body
}
