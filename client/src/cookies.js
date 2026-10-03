// Utilidades mínimas para cookies de preferencias (src/cookies.js)
const YEAR = 60 * 60 * 24 * 365

export function getCookie(name) {
  const hit = document.cookie.split('; ').find(c => c.startsWith(`${name}=`))
  if (!hit) return null
  try { return decodeURIComponent(hit.slice(name.length + 1)) } catch { return null }
}

export function setCookie(name, value, maxAge = YEAR) {
  const secure = location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=${encodeURIComponent(value)}; Max-Age=${maxAge}; Path=/; SameSite=Lax${secure}`
}
