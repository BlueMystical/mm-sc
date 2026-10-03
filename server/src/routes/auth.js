// mm-sc/server/src/routes/auth.js
import { Router } from 'express'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { db } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'

const router = Router()
const isProd = process.env.NODE_ENV === 'production'
const WEEK_MS = 7 * 24 * 60 * 60 * 1000

// Llamadas servidor→Discord. Si Discord bloquea la IP del hosting (429 de Cloudflare),
// se pueden enviar por un proxy propio: DISCORD_API_BASE + DISCORD_PROXY_KEY.
const DISCORD_API = (process.env.DISCORD_API_BASE || 'https://discord.com/api').replace(/\/$/, '')
const proxyAuth = process.env.DISCORD_PROXY_KEY ? { 'x-proxy-key': process.env.DISCORD_PROXY_KEY } : {}

// Registra por qué Discord rechazó una llamada (sin datos sensibles) para poder diagnosticar en producción
async function discordFail(res, step) {
  const body = await res.text().catch(() => '')
  console.error(`[discord ${step}] HTTP ${res.status}`, {
    contentType: res.headers.get('content-type'),
    retryAfter: res.headers.get('retry-after'),
    rateLimitScope: res.headers.get('x-ratelimit-scope'),
    cfRay: res.headers.get('cf-ray'),
    body: body.slice(0, 300)
  })
  return new Error(`Discord ${step}: ${res.status}`)
}

// 1) Redirige al usuario a Discord
router.get('/discord', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex')
  res.cookie('oauth_state', state, {
    httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 10 * 60 * 1000
  })
  const params = new URLSearchParams({
    client_id: process.env.DISCORD_CLIENT_ID,
    redirect_uri: process.env.DISCORD_REDIRECT_URI,
    response_type: 'code',
    scope: 'identify',
    state
  })
  res.redirect(`https://discord.com/oauth2/authorize?${params}`)
})

// 2) Discord vuelve aquí con un "code"
router.get('/discord/callback', async (req, res) => {
  const { code, state } = req.query
  if (!code || !state || state !== req.cookies.oauth_state) {
    return res.status(400).send('Invalid OAuth state')
  }
  res.clearCookie('oauth_state')

  try {
    const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
      method: 'POST',
      signal: AbortSignal.timeout(15000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', ...proxyAuth },
      body: new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DISCORD_REDIRECT_URI
      })
    })
    if (!tokenRes.ok) throw await discordFail(tokenRes, 'token')
    const { access_token } = await tokenRes.json()

    const meRes = await fetch(`${DISCORD_API}/users/@me`, {
      signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Bearer ${access_token}`, ...proxyAuth }
    })
    if (!meRes.ok) throw await discordFail(meRes, '/users/@me')
    const me = await meRes.json()

    const avatar = me.avatar
      ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png`
      : null

    // Crea el usuario si no existe; si existe, refresca nombre y avatar
    const result = await db.execute({
      sql: `INSERT INTO users (discord_id, user_name, avatar)
            VALUES (?, ?, ?)
            ON CONFLICT(discord_id) DO UPDATE
              SET user_name = excluded.user_name, avatar = excluded.avatar
            RETURNING user_id`,
      args: [me.id, me.global_name || me.username, avatar]
    })
    const userId = Number(result.rows[0].user_id)

    const token = jwt.sign({ uid: userId }, process.env.JWT_SECRET, { expiresIn: '7d' })
    res.cookie('token', token, {
      httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: WEEK_MS
    })
    res.redirect(process.env.CLIENT_ORIGIN)
  } catch (err) {
    console.error(err)
    res.redirect(`${process.env.CLIENT_ORIGIN}/?login=error`)
  }
})

// 3) Usuario actual
router.get('/me', requireAuth, async (req, res) => {
  const r = await db.execute({
    sql: 'SELECT user_id, user_name, avatar, reputation FROM users WHERE user_id = ?',
    args: [req.userId]
  })
  const u = r.rows[0]
  if (!u) return res.status(401).json({ error: 'unauthorized' })
  res.json({
    user_id: u.user_id,
    user_name: u.user_name,
    avatar: u.avatar,
    reputation: u.reputation
  })
})

router.post('/logout', (req, res) => {
  res.clearCookie('token')
  res.json({ ok: true })
})

export default router