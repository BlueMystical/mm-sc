// Worker de apoyo para MM-SC. Hace dos cosas independientes:
// 1) fetch:     proxy mínimo hacia la API de Discord (SOLO dos llamadas, con clave compartida PROXY_KEY).
// 2) scheduled: cada pocos minutos visita KEEPALIVE_URL para que Render no apague el servicio por inactividad.
const ROUTES = new Set(['POST /oauth2/token', 'GET /users/@me'])
const DISCORD_API = 'https://discord.com/api'

// Comparación en tiempo constante (evita filtrar la clave por tiempos de respuesta)
function safeEqual(a, b) {
  const x = new TextEncoder().encode(a)
  const y = new TextEncoder().encode(b)
  let diff = x.length ^ y.length
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0)
  return diff === 0
}

export default {
  // Cron Trigger: Render apaga el plan gratuito tras 15 min sin tráfico; este ping lo mantiene despierto
  async scheduled(event, env, ctx) {
    if (!env.KEEPALIVE_URL) return
    ctx.waitUntil(
      fetch(env.KEEPALIVE_URL, { headers: { 'user-agent': 'mm-sc-keepalive' } })
        .then(r => console.log('keepalive', r.status))
        .catch(e => console.log('keepalive failed', String(e)))
    )
  },

  async fetch(request, env) {
    const url = new URL(request.url)

    const key = request.headers.get('x-proxy-key') ?? ''
    if (!env.PROXY_KEY || !safeEqual(key, env.PROXY_KEY)) {
      // Diagnóstico temporal (solo con DEBUG_AUTH=1): longitudes, nunca el valor de la clave
      const why = env.DEBUG_AUTH === '1'
        ? ` (secret ${env.PROXY_KEY ? `set, length ${env.PROXY_KEY.length}` : 'MISSING'}; received length ${key.length})`
        : ''
      return new Response(`forbidden${why}`, { status: 403 })
    }
    if (!ROUTES.has(`${request.method} ${url.pathname}`)) {
      return new Response('not found', { status: 404 })
    }

    // Solo viajan a Discord las cabeceras necesarias (la clave del proxy no se reenvía)
    const headers = new Headers({ 'user-agent': 'mm-sc-proxy' })
    for (const h of ['content-type', 'authorization']) {
      const v = request.headers.get(h)
      if (v) headers.set(h, v)
    }

    const res = await fetch(`${DISCORD_API}${url.pathname}`, {
      method: request.method,
      headers,
      body: request.method === 'POST' ? request.body : undefined
    })

    // Devuelve el estado de Discord tal cual (incluidos 429), para que el servidor lo registre
    const out = new Headers({ 'content-type': res.headers.get('content-type') ?? 'application/json' })
    const retryAfter = res.headers.get('retry-after')
    if (retryAfter) out.set('retry-after', retryAfter)
    return new Response(res.body, { status: res.status, headers: out })
  }
}
