// mm-sc/server/src/middleware/standing.js
import { db } from '../db/client.js'
import { getStanding, RULES } from '../services/standing.js'

// Usar DESPUÉS de requireAuth. action: clave de RULES (create_order, manage_inventory)
export function requireStanding(action) {
  return async (req, res, next) => {
    const s = await getStanding(req.userId)
    if (!s) return res.status(401).json({ error: 'unauthorized' })

    const rule = RULES[s.level][action]
    if (rule === false) {
      return res.status(403).json({
        error: s.level === 'suspended' ? 'account_suspended' : 'account_restricted'
      })
    }
    if (rule && typeof rule === 'object' && rule.maxActive != null) {
      const c = await db.execute({
        sql: `SELECT COUNT(*) AS n FROM orders
              WHERE buyer_id = ? AND status IN ('pending', 'accepted')`,
        args: [req.userId]
      })
      if (Number(c.rows[0].n) >= rule.maxActive) {
        return res.status(403).json({ error: 'probation_limit' })
      }
    }
    req.standing = s
    next()
  }
}
