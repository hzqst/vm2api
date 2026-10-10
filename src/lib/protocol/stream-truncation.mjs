/**
 * Upstream sometimes closes a Claude stream mid-response: no error event, no
 * message_stop. Interactive Claude Code then shows "Connection lost
 * mid-response" and ends the turn. It recovers from max_tokens everywhere:
 * a cut tool call comes back as an input validation error and the model
 * re-issues it, cut text gets the output-limit resume nudge. Once output
 * reached the client, close the message as max_tokens instead of dropping it.
 * A thinking block cut mid-way cannot be closed (it needs a signature).
 */

const CLOSABLE_BLOCKS = new Set(['text', 'tool_use'])

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

export function createAnthropicStreamTracker() {
  let started = false
  let finished = false
  let open = null
  let outputTokens = 0
  return {
    observe(line) {
      const text = String(line)
      const dataLine = text
        .split('\n')
        .map((row) => row.trim())
        .find((row) => row.startsWith('data:'))
      if (!dataLine) return
      let event
      try {
        event = JSON.parse(dataLine.slice(5).trim())
      } catch {
        return
      }
      switch (event?.type) {
        case 'message_start':
          started = true
          outputTokens = event.message?.usage?.output_tokens || outputTokens
          break
        case 'content_block_start':
          open = { index: event.index, type: event.content_block?.type }
          break
        case 'content_block_stop':
          if (open?.index === event.index) open = null
          break
        case 'message_delta':
          outputTokens = event.usage?.output_tokens || outputTokens
          break
        case 'message_stop':
        case 'error':
          finished = true
          break
        default:
          break
      }
    },
    /** SSE text that ends the message as max_tokens, or null when it cannot be closed. */
    closingEvents() {
      if (!started || finished) return null
      if (open && !CLOSABLE_BLOCKS.has(open.type)) return null
      let out = ''
      if (open) out += sse('content_block_stop', { type: 'content_block_stop', index: open.index })
      out += sse('message_delta', {
        type: 'message_delta',
        delta: { stop_reason: 'max_tokens', stop_sequence: null },
        usage: { output_tokens: outputTokens },
      })
      out += sse('message_stop', { type: 'message_stop' })
      finished = true
      return out
    },
  }
}

/** A timeout would just stall again if the client retries. An upstream error event already reached the client. */
export function isRecoverableTruncation(result) {
  const error = result?.body?.error
  if (!error) return true
  return !/timeout/i.test(`${error.code || ''} ${error.type || ''} ${error.message || ''}`)
}
