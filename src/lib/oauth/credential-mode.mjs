/**
 * Slot credential kinds: full OAuth, converted Setup Token (complete oat),
 * official `claude setup-token` (inference-only), and Console API Key.
 */
import { flattenOauthIdentity } from './oauth-identity.mjs'
import { isCodexVm } from '../vm/vm-kind.mjs'

export const CREDENTIAL_OAUTH = 'oauth'
export const CREDENTIAL_SETUP_TOKEN = 'setup-token'
export const CREDENTIAL_OFFICIAL_SETUP_TOKEN = 'official-setup-token'
export const CREDENTIAL_APIKEY = 'apikey'

export function normalizeCredentialMode(raw) {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/_/g, '-')
  if (s === 'official-setup-token' || s === 'office-setup-token' || s === 'claude-setup-token') {
    return CREDENTIAL_OFFICIAL_SETUP_TOKEN
  }
  if (s === 'setup-token') return CREDENTIAL_SETUP_TOKEN
  if (s === 'inference') return CREDENTIAL_OFFICIAL_SETUP_TOKEN
  if (s === 'apikey' || s === 'api-key' || s === 'console' || s === 'console-key') return CREDENTIAL_APIKEY
  return CREDENTIAL_OAUTH
}

export function isApiKeyMode(raw) {
  return normalizeCredentialMode(raw) === CREDENTIAL_APIKEY
}

export function isSetupTokenMode(raw) {
  return normalizeCredentialMode(raw) === CREDENTIAL_SETUP_TOKEN
}

export function isOfficialSetupTokenMode(raw) {
  return normalizeCredentialMode(raw) === CREDENTIAL_OFFICIAL_SETUP_TOKEN
}

export function isAnySetupTokenMode(raw) {
  return isSetupTokenMode(raw) || isOfficialSetupTokenMode(raw)
}

export function canOfficialCc(raw) {
  return normalizeCredentialMode(raw) === CREDENTIAL_OAUTH
}

/** Official GET /api/oauth/usage|/profile. Converted setup-token keeps the full grant. */
export function canOfficialUsage(raw) {
  const mode = normalizeCredentialMode(raw)
  return mode === CREDENTIAL_OAUTH || mode === CREDENTIAL_SETUP_TOKEN
}

export function canCountTokens(raw) {
  return isAnySetupTokenMode(raw) || isApiKeyMode(raw)
}

export function canRefreshCredential(raw) {
  return !isApiKeyMode(raw) && !isOfficialSetupTokenMode(raw)
}

export function looksLikeConsoleApiKey(value) {
  return /^sk-ant-api03-/i.test(String(value || '').trim())
}

export function looksLikeSessionKey(value) {
  return /^sk-ant-sid/i.test(String(value || '').trim())
}

/** Official `claude setup-token` / CLAUDE_CODE_OAUTH_TOKEN. Same prefix as short-lived OAuth access. */
export function looksLikeOauthAccessToken(value) {
  return /^sk-ant-oat01-/i.test(String(value || '').trim())
}

function scopeText(oauth = {}) {
  if (Array.isArray(oauth.scopes) && oauth.scopes.length) return oauth.scopes.filter(Boolean).join(' ')
  return String(oauth.scope || '')
}

/** Year-long official CLI token: inference only, no refresh. */
export function isOfficialSetupTokenGrant(oauth = {}) {
  const labeled = normalizeCredentialMode(oauth.type || oauth.mode || oauth.credential_mode)
  if (labeled === CREDENTIAL_OFFICIAL_SETUP_TOKEN) return true
  const source = String(oauth.source || '')
  const flavor = String(oauth.flavor || '').replace(/_/g, '-')
  if (source === 'claude-setup-token' || flavor === 'claude-setup-token') return true
  const refresh = String(oauth.refresh_token || oauth.refreshToken || '').trim()
  if (refresh) return false
  const scopes = scopeText(oauth)
    .split(/\s+/)
    .filter(Boolean)
    .map((item) => (item === 'inference' ? 'user:inference' : item))
  return scopes.length > 0 && scopes.every((item) => item === 'user:inference')
}

export function credentialModeFromOauth(oauth = {}) {
  const typed = oauth.type || oauth.mode || oauth.credential_mode
  const labeled = typed ? normalizeCredentialMode(typed) : ''
  if (labeled === CREDENTIAL_APIKEY) return CREDENTIAL_APIKEY
  if (looksLikeConsoleApiKey(oauth.api_key || oauth.apiKey || oauth.access_token || oauth.accessToken)) {
    return CREDENTIAL_APIKEY
  }
  if (isOfficialSetupTokenGrant(oauth)) return CREDENTIAL_OFFICIAL_SETUP_TOKEN
  if (labeled === CREDENTIAL_SETUP_TOKEN) return CREDENTIAL_SETUP_TOKEN
  const scope = scopeText(oauth)
  if (oauth.flavor === 'setup_token' || oauth.flavor === 'setup-token') return CREDENTIAL_SETUP_TOKEN
  if (/user:profile|user:sessions:claude_code/.test(scope)) return CREDENTIAL_OAUTH
  if (scope && /user:inference/.test(scope)) return CREDENTIAL_SETUP_TOKEN
  return labeled || CREDENTIAL_OAUTH
}

export function credentialModeOfVm(vm = {}) {
  return normalizeCredentialMode(vm.credential_mode || vm.claude?.mode || vm.claude_mode)
}

/** Reset credits only. Converted setup-token with user:profile is a full OAuth grant. */
export function canClaudeResetCredits(vm = {}, { hasToken } = {}) {
  if (isCodexVm(vm)) return false
  const mode = credentialModeOfVm(vm)
  if (isApiKeyMode(mode) || isOfficialSetupTokenMode(mode)) return false
  const token =
    hasToken != null
      ? !!hasToken
      : !!(vm.has_token || vm.claude?.has_access || vm.claude?.access_token || vm.claude?.refresh_token)
  if (!token) return false
  const scope = [vm.claude?.scope, Array.isArray(vm.claude?.scopes) ? vm.claude.scopes.join(' ') : '', vm.oauth_scope]
    .filter(Boolean)
    .join(' ')
  if (/(^|\s)user:profile(\s|$)/.test(scope)) return true
  return !isSetupTokenMode(mode)
}

function fail(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

/** Relabel a live OAuth grant as setup-token. Keep refresh and real expiry. */
export function liveOauthToSetupToken(oauth = {}) {
  const access = String(oauth.access_token || oauth.accessToken || '').trim()
  if (!access) throw fail('credential_required', '当前槽没有可转换的 OAuth access token')
  if (
    isApiKeyMode(oauth.type || oauth.mode) ||
    looksLikeConsoleApiKey(access) ||
    looksLikeConsoleApiKey(oauth.api_key || oauth.apiKey)
  ) {
    throw fail('credential_kind_mismatch', 'Console API Key 不能转为 Setup Token')
  }
  const identity = flattenOauthIdentity(oauth)
  const scopes = Array.isArray(oauth.scopes)
    ? oauth.scopes.filter(Boolean)
    : String(oauth.scope || '')
        .split(/\s+/)
        .filter(Boolean)
  return {
    type: CREDENTIAL_SETUP_TOKEN,
    mode: CREDENTIAL_SETUP_TOKEN,
    access_token: access,
    refresh_token: String(oauth.refresh_token || oauth.refreshToken || ''),
    expires_at: oauth.expires_at || oauth.expiresAt || null,
    email: identity.email,
    account_uuid: identity.account_uuid,
    org_uuid: identity.org_uuid,
    scope: scopes.length ? scopes.join(' ') : oauth.scope || null,
    scopes,
    source: 'oauth-to-setup-token',
    auth_scheme: oauth.auth_scheme || oauth.authScheme || undefined,
  }
}
