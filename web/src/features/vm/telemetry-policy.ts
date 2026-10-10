/**
 * The only telemetry read. Matches `isTelemetryEnabled` in
 * `src/lib/protocol/seed-policy.mjs`: on iff `telemetry_disabled === false`.
 * `disable_nonessential_traffic` and `do_not_track` are derived mirrors.
 * Missing the field means off, same as `defaultSeedPolicy`.
 */
export function telemetryEnabled(
  policy: Record<string, unknown> | null | undefined
): boolean {
  return policy?.telemetry_disabled === false
}

export type TelemetrySeedFlags = {
  telemetry_disabled: boolean
  disable_nonessential_traffic: boolean
  do_not_track: boolean
}

/** Write-side mirrors. Do not read these to decide whether telemetry is on. */
export function telemetrySeedFlags(enabled: boolean): TelemetrySeedFlags {
  return {
    telemetry_disabled: !enabled,
    disable_nonessential_traffic: enabled,
    do_not_track: !enabled,
  }
}

/**
 * Detail-page status. Configured on/off comes from the seed bit above.
 * `running` stays a process observation and is not a second on/off switch.
 * No seed object: keep the process snapshot (unknown stays unknown).
 */
export function telemetryView<T extends { enabled?: boolean | null }>(
  seedPolicy: Record<string, unknown> | null | undefined,
  observed: T | null | undefined
): T | { enabled: boolean } | null {
  if (!seedPolicy || typeof seedPolicy !== 'object') return observed ?? null
  return { ...(observed || {}), enabled: telemetryEnabled(seedPolicy) }
}
