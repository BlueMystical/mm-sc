// Cliente HTTP mínimo. Las cookies viajan solas (same-origin vía proxy).
import { i18n } from '@/i18n.js'

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || code)
    this.status = status
    this.code = code
    this.details = details
  }
}

async function request(method, path, { body, query } = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v !== undefined && v !== null && v !== '') qs.set(k, v)
  }
  const url = `/api${path}${qs.size ? `?${qs}` : ''}`

  let res
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined
    })
  } catch {
    throw new ApiError(0, 'network_error')
  }

  if (res.status === 204) return null

  const data = await res.json().catch(() => null)
  if (!res.ok) {
    // Sin JSON y con 5xx: el proxy no alcanzó a Express (caído o reiniciando)
    const code = data?.error
      ?? (res.status === 429 ? 'rate_limited' : res.status >= 500 ? 'server_unavailable' : 'unknown_error')
    throw new ApiError(res.status, code, data?.message, data?.details)
  }
  return data
}

export const api = {
  get: (path, query) => request('GET', path, { query }),
  post: (path, body) => request('POST', path, { body: body ?? {} }),
  patch: (path, body) => request('PATCH', path, { body }),
  del: path => request('DELETE', path)
}

// Texto traducido para un código de error del backend (errors.<code> en src/locales)
export function errorText(code) {
  const { t, te } = i18n.global
  const key = `errors.${code}`
  return te(key) ? t(key) : t('errors.unknown_error')
}

export function errorMessage(err) {
  return errorText(err instanceof ApiError ? err.code : 'unknown_error')
}

// Errores que indican que el backend o la base no están disponibles (no un fallo del usuario)
export function isBackendDown(err) {
  return err instanceof ApiError &&
    (err.status === 0 || err.status >= 500 || err.code === 'db_unavailable')
}
