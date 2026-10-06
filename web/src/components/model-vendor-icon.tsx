import { useState } from 'react'
import {
  accentColorOf,
  modelIconUrl,
} from '@/lib/model-vendor/vendor-icon-files'
import { getVendorEntry } from '@/lib/model-vendor/vendor-icons'
import {
  inferVendorFromModelName,
  UNKNOWN_VENDOR,
} from '@/lib/model-vendor/vendor-inference'
import { cn } from '@/lib/utils'

function MonogramIcon({
  seed,
  className,
}: {
  seed: string
  className: string
}) {
  const initial = (/[a-z0-9]/i.exec(seed)?.[0] ?? '?').toUpperCase()
  const color = accentColorOf(seed)
  return (
    <span
      aria-hidden='true'
      style={{
        backgroundColor: `color-mix(in oklch, ${color} 15%, transparent)`,
        color,
      }}
      className={cn(
        'inline-flex items-center justify-center rounded-sm text-[0.55em] leading-none font-semibold select-none',
        className
      )}
    >
      {initial}
    </span>
  )
}

function StaticVendorIcon({
  file,
  mono,
  fallbackSeed,
  className,
}: {
  file: string
  mono: boolean
  fallbackSeed: string
  className: string
}) {
  // 记录失败的具体文件而非布尔值：file 变化后自动重试新图标。
  const [failedFile, setFailedFile] = useState<string | null>(null)
  if (failedFile === file) {
    return <MonogramIcon seed={fallbackSeed} className={className} />
  }
  return (
    <img
      src={modelIconUrl(file)}
      alt=''
      aria-hidden='true'
      loading='lazy'
      onError={() => setFailedFile(file)}
      className={cn('select-none', mono && 'dark:invert', className)}
    />
  )
}

/**
 * 模型厂商图标。
 * 解析顺序：按模型名推断 vendor -> 本地打包的 @lobehub/icons 组件
 * -> public/model-icons 静态 SVG -> 字母 monogram。
 */
export function ModelVendorIcon({
  modelId,
  className,
}: {
  modelId: string
  className?: string
}) {
  const cls = cn('h-3.5 w-3.5 shrink-0', className)
  const vendor = inferVendorFromModelName(modelId)
  if (vendor === UNKNOWN_VENDOR) {
    return <MonogramIcon seed={modelId} className={cls} />
  }
  const entry = getVendorEntry(vendor)
  if (entry.icon) {
    const Icon = entry.icon
    return <Icon className={cls} />
  }
  if (entry.iconFile) {
    return (
      <StaticVendorIcon
        file={entry.iconFile.file}
        mono={entry.iconFile.mono === true}
        fallbackSeed={vendor}
        className={cls}
      />
    )
  }
  return <MonogramIcon seed={vendor} className={cls} />
}
