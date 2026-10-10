import fs from 'node:fs'
import path from 'node:path'

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

function distRoot(projectRoot) {
  return path.resolve(projectRoot, 'web', 'dist')
}

function safeFile(root, rel) {
  const resolved = path.resolve(root, rel)
  const prefix = root.endsWith(path.sep) ? root : root + path.sep
  if (resolved !== root && !resolved.startsWith(prefix)) return ''
  try {
    if (!fs.statSync(resolved).isFile()) return ''
  } catch {
    return ''
  }
  return resolved
}

// Vite 把内容哈希写进 assets/ 下的文件名，内容变了 URL 就变，可以永久缓存；
// index.html 必须每次重新取，才能拿到新的哈希文件名。
function cacheControl(rel, ext) {
  if (ext === '.html') return 'no-store'
  if (rel.startsWith('assets/')) return 'public, max-age=31536000, immutable'
  return 'public, max-age=86400'
}

export function tryServeWebDist(res, projectRoot, pathname) {
  const root = distRoot(projectRoot)
  try {
    if (!fs.statSync(root).isDirectory()) return false
  } catch {
    return false
  }

  const raw = String(pathname || '')
  const rel = raw === '/console' || raw === '/console/' ? 'index.html' : decodeURIComponent(raw.replace(/^\/+/, ''))
  if (!rel || rel.includes('\0') || rel.split(/[\\/]/).includes('..')) return false

  const file = safeFile(root, rel)
  if (!file) return false

  const ext = path.extname(file).toLowerCase()
  res.writeHead(200, {
    'content-type': MIME[ext] || 'application/octet-stream',
    'cache-control': cacheControl(rel, ext),
  })
  res.end(fs.readFileSync(file))
  return true
}
