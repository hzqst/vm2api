/**
 * Copy text, returning whether it reached the clipboard.
 *
 * `navigator.clipboard` exists only in secure contexts (HTTPS / localhost), so
 * a panel served over plain `http://ip:port` has none; it can also reject when
 * the click's user activation expired during an awaited request. The legacy
 * `execCommand('copy')` path still works over plain HTTP inside a gesture.
 */
export async function copyText(text: string): Promise<boolean> {
  if (!text) return false
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // Permission denied or activation lost: try the selection path below.
    }
  }
  return copyViaSelection(text)
}

function copyViaSelection(text: string): boolean {
  const active = document.activeElement as HTMLElement | null
  // A modal dialog traps focus; a textarea outside it would lose focus and
  // the selection before the copy runs.
  const host = active?.closest<HTMLElement>('[role="dialog"]') ?? document.body
  const area = document.createElement('textarea')
  area.value = text
  area.setAttribute('readonly', '')
  area.setAttribute('aria-hidden', 'true')
  Object.assign(area.style, {
    position: 'fixed',
    top: '0',
    left: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
  })
  host.appendChild(area)
  area.focus({ preventScroll: true })
  area.select()
  area.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {
    ok = false
  }
  area.remove()
  active?.focus?.({ preventScroll: true })
  return ok
}
