import { HttpsProxyAgent } from 'https-proxy-agent'
import { SocksProxyAgent } from 'socks-proxy-agent'
import { normalizeSocksHost } from './socks-address.mjs'

/**
 * SOCKS agent with an unbracketed socket host. socks-proxy-agent 10.1.0 copies
 * URL.hostname, so `socks5h://[::1]:1080` dials `[::1]` and fails DNS before
 * reaching the proxy (TooTallNate/proxy-agents#437).
 */
export function createSocksProxyAgent(proxyUrl) {
  const agent = new SocksProxyAgent(proxyUrl)
  const host = normalizeSocksHost(agent.proxy.host)
  if (!host) throw new Error('invalid SOCKS proxy host')
  agent.proxy.host = host
  return agent
}

/** Unknown schemes throw: a request must never fall back to the host's direct route. */
export function createProxyAgent(proxyUrl) {
  const { protocol } = new URL(proxyUrl)
  if (protocol === 'socks5:' || protocol === 'socks5h:') return createSocksProxyAgent(proxyUrl)
  if (protocol === 'http:' || protocol === 'https:') return new HttpsProxyAgent(proxyUrl)
  throw new Error(`unsupported proxy scheme ${protocol}`)
}
