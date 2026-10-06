/** Shared timezone validation for slot startup and workstation fingerprints. */
export const US_TIMEZONES = Object.freeze([
  'America/New_York',
  'America/Chicago',
  'America/Denver',
  'America/Los_Angeles',
])
export const DEFAULT_TIMEZONE = 'America/Los_Angeles'

export function validTimezone(value) {
  const timezone = String(value || '').trim()
  // Intl also accepts numeric offsets on newer Node versions; TZ needs a named zone.
  if (!timezone || /^[+-]/.test(timezone)) return ''
  try {
    // Intl accepts case-insensitive input; Linux TZ paths are case-sensitive.
    return new Intl.DateTimeFormat('en-US', { timeZone: timezone }).resolvedOptions().timeZone
  } catch {
    return ''
  }
}

export function normalizeTimezone(value) {
  return validTimezone(value) || DEFAULT_TIMEZONE
}

/** Panel/report tz from the browser: any IANA zone, unknown → UTC (never the slot default). */
export function reportTimezone(value) {
  return validTimezone(value) || 'UTC'
}

const partsFormatters = new Map()

/** Wall-clock parts of `ms` in `timeZone`. */
export function zonedParts(ms, timeZone) {
  let fmt = partsFormatters.get(timeZone)
  if (!fmt) {
    fmt = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    partsFormatters.set(timeZone, fmt)
  }
  const out = {}
  for (const part of fmt.formatToParts(new Date(ms))) if (part.type !== 'literal') out[part.type] = Number(part.value)
  return out
}

/** Epoch ms for a wall-clock time in `timeZone` (DST-safe, two passes). Out-of-range days roll over. */
export function zonedWallToMs({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const wall = Date.UTC(year, month - 1, day, hour, minute)
  let ms = wall
  for (let i = 0; i < 2; i++) {
    const seen = zonedParts(ms, timeZone)
    const seenWall = Date.UTC(seen.year, seen.month - 1, seen.day, seen.hour, seen.minute)
    ms += wall - seenWall
  }
  return ms
}

/** Local midnight `dayOffset` days from the day containing `ms`. */
export function zonedDayStartMs(ms, timeZone, dayOffset = 0) {
  const p = zonedParts(ms, timeZone)
  return zonedWallToMs({ year: p.year, month: p.month, day: p.day + dayOffset }, timeZone)
}
