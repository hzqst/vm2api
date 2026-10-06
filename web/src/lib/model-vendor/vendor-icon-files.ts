// Vendor slug -> LobeHub static SVG icon file resolution.
// vendor-icon-map.json is a verbatim copy of claude-code-hub's map (itself the
// cch-plus.com pricing-table icon map). Every referenced file is vendored under
// web/public/model-icons so the panel never depends on a third-party host.
import { resolveByDashPrefix } from './dash-prefix-lookup'
import iconMap from './vendor-icon-map.json'

export interface VendorIconFileEntry {
  file: string
  mono?: boolean
}

const ICONS = iconMap as Record<string, VendorIconFileEntry>

export const MODEL_ICON_BASE_URL = `${import.meta.env.BASE_URL}model-icons/`

/** 本地静态 SVG 地址；file 为映射表内的基名。 */
export function modelIconUrl(file: string): string {
  return `${MODEL_ICON_BASE_URL}${file}`
}

/** 精确命中 -> 最长前缀家族(alibaba-coding-plan-cn -> alibaba)回退；都没有返回 null */
export function iconFileForVendor(slug: string): VendorIconFileEntry | null {
  return resolveByDashPrefix(slug, ICONS)
}

/** 映射表里出现过的全部文件基名（去重），供完整性测试核对 public/model-icons。 */
export function allVendorIconFiles(): string[] {
  return [...new Set(Object.values(ICONS).map((entry) => entry.file))]
}

/** 任意字符串 -> 确定性强调色(固定明度/彩度,色相走 hash),用于 monogram 兜底 */
export function accentColorOf(seed: string): string {
  let h = 0
  for (const ch of seed.toLowerCase()) {
    h = (h * 31 + (ch.codePointAt(0) ?? 0)) | 0
  }
  const hue = ((h % 360) + 360) % 360
  return `oklch(0.62 0.13 ${hue})`
}
