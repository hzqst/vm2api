import { describe, expect, it } from 'vitest'
import { allVendorIconFiles, iconFileForVendor } from './vendor-icon-files'

// Vite glob keeps this check inside the browser tsconfig (no node typings).
const VENDORED = Object.keys(
  import.meta.glob('/public/model-icons/*.svg', { query: '?url' })
).map((key) => key.slice(key.lastIndexOf('/') + 1))

describe('vendor icon files', () => {
  it('vendors every mapped SVG under public/model-icons', () => {
    const files = allVendorIconFiles()
    expect(files.length).toBe(109)
    expect(files.filter((file) => !VENDORED.includes(file))).toEqual([])
  })

  it('falls back to the dash-prefix family', () => {
    expect(iconFileForVendor('alibaba-coding-plan-cn')?.file).toBe(
      'alibaba-color.svg'
    )
    expect(iconFileForVendor('unknown-vendor')).toBeNull()
  })
})
