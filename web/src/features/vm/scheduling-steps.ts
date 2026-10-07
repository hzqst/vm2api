/** 并发档位；0 = 不限（只在单槽覆盖里给出，分档默认至少 1）。 */
export const CONC_STEPS: [number, string][] = [
  [0, '不限'],
  [1, '1'],
  [2, '2'],
  [4, '4'],
  [8, '8'],
  [16, '16'],
  [20, '20'],
  [32, '32'],
  [64, '64'],
]

export const RPM_STEPS: [number, string][] = [
  [0, '不限'],
  [10, '10'],
  [15, '15'],
  [20, '20'],
  [30, '30'],
  [60, '60'],
  [120, '120'],
]

/** 5h / 7d 闸线档位：30–100%，步长 5。 */
export const RATIO_STEPS = Array.from({ length: 15 }, (_, i) => 30 + i * 5)

/** 席位上限档位；硬上限 20 = 内核预开的 native 位。 */
export const SEAT_CAP_STEPS = [1, 2, 4, 8, 12, 16, 20]

/** 服务端存了不在档位里的值（手改 json）时把它补进选项，不被吞成别的档。 */
export function withCurrent(
  steps: [number, string][],
  current: number
): [number, string][] {
  if (steps.some(([v]) => v === current)) return steps
  return [...steps, [current, String(current)] as [number, string]].sort(
    (a, b) => a[0] - b[0]
  )
}
