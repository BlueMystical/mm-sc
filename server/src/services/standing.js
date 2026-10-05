// mm-sc/server/src/services/standing.js
// Estado ("standing") de un usuario según su reputación, sus strikes y las sanciones vigentes.
//
//   suspended  -> baneo manual (banned_at)
//   restricted -> restricted_until en el futuro (la fija el sistema al caer bajo RESTRICTED_AT)
//   probation  -> score <= PROBATION_AT con evidencia suficiente
//   normal     -> el resto
//
// score = reputation - strikes. La evidencia mínima (reseñas recibidas + strikes) evita que una
// sola reseña negativa, o una venganza, condene a nadie.
import { db } from '../db/client.js'

export const STANDING = {
  MIN_EVIDENCE: 3,
  PROBATION_AT: -3,
  RESTRICTED_AT: -5,
  RESTRICT_DAYS: 14,
  PROBATION_MAX_ACTIVE_ORDERS: 2,
  // Quién recibe un strike al cancelar un pedido ya aceptado ([] para desactivarlo)
  STRIKE_ON_ACCEPTED_CANCEL: ['seller', 'buyer']
}

// Qué puede hacer cada nivel
export const RULES = {
  normal: { create_order: true, manage_inventory: true },
  probation: { create_order: { maxActive: STANDING.PROBATION_MAX_ACTIVE_ORDERS }, manage_inventory: true },
  restricted: { create_order: false, manage_inventory: true },
  suspended: { create_order: false, manage_inventory: false }
}

const nowSec = () => Math.floor(Date.now() / 1000)

export function computeStanding(u, now = nowSec()) {
  const reputation = Number(u.reputation ?? 0)
  const strikes = Number(u.strikes ?? 0)
  const reviewCount = Number(u.review_count ?? 0)
  const score = reputation - strikes
  const restrictedUntil = u.restricted_until == null ? null : Number(u.restricted_until)

  let level = 'normal'
  if (u.banned_at != null) level = 'suspended'
  else if (restrictedUntil && restrictedUntil > now) level = 'restricted'
  else if (reviewCount + strikes >= STANDING.MIN_EVIDENCE && score <= STANDING.PROBATION_AT) level = 'probation'

  return {
    level,
    reputation,
    strikes,
    score,
    review_count: reviewCount,
    restricted_until: level === 'restricted' ? restrictedUntil : null,
    ban_reason: level === 'suspended' ? (u.ban_reason ?? null) : null
  }
}

// exec puede ser `db` o una transacción (`tx`): ambos tienen execute()
export async function getStanding(userId, exec = db) {
  const r = await exec.execute({
    sql: `SELECT u.reputation, u.strikes, u.restricted_until, u.banned_at, u.ban_reason,
                 (SELECT COUNT(*) FROM reviews rv WHERE rv.reviewee_id = u.user_id) AS review_count
          FROM users u WHERE u.user_id = ?`,
    args: [userId]
  })
  return r.rows[0] ? computeStanding(r.rows[0]) : null
}

// Llamar tras un evento negativo (reseña negativa o strike). Si el score cayó bajo
// RESTRICTED_AT, impone RESTRICT_DAYS días de restricción. Cada nuevo evento negativo
// estando por debajo del umbral la vuelve a imponer; los positivos nunca lo hacen.
export async function applyPenaltyCheck(exec, userId) {
  const s = await getStanding(userId, exec)
  if (!s || s.level === 'restricted' || s.level === 'suspended') return
  if (s.review_count + s.strikes >= STANDING.MIN_EVIDENCE && s.score <= STANDING.RESTRICTED_AT) {
    await exec.execute({
      sql: 'UPDATE users SET restricted_until = unixepoch() + ? WHERE user_id = ?',
      args: [STANDING.RESTRICT_DAYS * 86400, userId]
    })
  }
}

export async function addStrike(exec, userId) {
  await exec.execute({ sql: 'UPDATE users SET strikes = strikes + 1 WHERE user_id = ?', args: [userId] })
  await applyPenaltyCheck(exec, userId)
}
