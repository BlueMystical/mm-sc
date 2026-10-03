// mm-sc/server/src/routes/orders.js
import { Router } from 'express'
import { z } from 'zod'
import rateLimit from 'express-rate-limit'
import { db } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import { getCommodities } from '../services/uex.js'

const router = Router()
router.use(requireAuth)

const createLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 20, // pedidos por hora y usuario
  keyGenerator: req => String(req.userId),
  standardHeaders: true,
  legacyHeaders: false
})

const createSchema = z.object({
  line_id: z.number().int().positive(),
  amount: z.number().int().positive(),
  message: z.string().trim().max(500).nullish()
})

// Crear pedido. Una sola sentencia atómica: valida disponibilidad y toma el precio actual
router.post('/', createLimiter, async (req, res) => {
  const parsed = createSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues })
  }
  const { line_id, amount, message } = parsed.data

  const r = await db.execute({
    sql: `INSERT INTO orders (buyer_id, seller_id, line_id, amount, unit_price, message)
          SELECT ?, i.user_id, l.line_id, ?, l.price, ?
          FROM inventory_lines l
          JOIN inventories i ON i.inventory_id = l.inventory_id
          WHERE l.line_id = ?
            AND l.is_visible = 1
            AND i.visibility IN ('public', 'unlisted')
            AND i.user_id != ?
            AND l.stock >= ?
          RETURNING *`,
    args: [req.userId, amount, message ?? null, line_id, req.userId, amount]
  })
  if (!r.rows[0]) {
    return res.status(409).json({
      error: 'line_not_available',
      message: 'The line does not exist, is unavailable, has insufficient stock, or is yours.'
    })
  }
  res.status(201).json({ ...r.rows[0] })
})

const listSchema = z.object({
  role: z.enum(['buyer', 'seller']).optional(),
  status: z.enum(['pending', 'accepted', 'rejected', 'completed', 'cancelled']).optional()
})

// Mis pedidos (como comprador, vendedor o ambos)
router.get('/', async (req, res) => {
  const parsed = listSchema.safeParse(req.query)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_query', details: parsed.error.issues })
  }
  const { role, status } = parsed.data

  const where = []
  const args = []
  if (role === 'buyer') {
    where.push('o.buyer_id = ?'); args.push(req.userId)
  } else if (role === 'seller') {
    where.push('o.seller_id = ?'); args.push(req.userId)
  } else {
    where.push('(o.buyer_id = ? OR o.seller_id = ?)'); args.push(req.userId, req.userId)
  }
  if (status) { where.push('o.status = ?'); args.push(status) }

  const r = await db.execute({
    sql: `SELECT o.order_id, o.status, o.amount, o.unit_price, o.message,
                 o.created_at, o.updated_at, o.buyer_id, o.seller_id,
                 l.line_id, l.item_id, i.inventory_id, i.title AS inventory_title,
                 b.user_name AS buyer_name, b.avatar AS buyer_avatar,
                 b.reputation AS buyer_reputation,
                 s.user_name AS seller_name, s.avatar AS seller_avatar,
                 s.reputation AS seller_reputation,
                 CASE WHEN o.status IN ('accepted', 'completed') THEN b.discord_id END AS buyer_discord_id,
                 CASE WHEN o.status IN ('accepted', 'completed') THEN s.discord_id END AS seller_discord_id,
                 EXISTS (SELECT 1 FROM reviews rv
                         WHERE rv.order_id = o.order_id AND rv.reviewer_id = ?) AS reviewed
          FROM orders o
          JOIN inventory_lines l ON l.line_id = o.line_id
          JOIN inventories i ON i.inventory_id = l.inventory_id
          JOIN users b ON b.user_id = o.buyer_id
          JOIN users s ON s.user_id = o.seller_id
          WHERE ${where.join(' AND ')}
          ORDER BY o.updated_at DESC
          LIMIT 100`,
    args: [req.userId, ...args]
  })
  const names = await getCommodities().catch(() => new Map())
  res.json(r.rows.map(o => ({ ...o, item_name: names.get(o.item_id)?.name ?? null })))
})

// Quién puede hacer cada cambio de estado
const TRANSITIONS = {
  pending: { accepted: 'seller', rejected: 'seller', cancelled: 'buyer' },
  accepted: { completed: 'seller', cancelled: 'both' }
}
const statusSchema = z.object({
  status: z.enum(['accepted', 'rejected', 'completed', 'cancelled'])
})

async function changeStatus(tx, orderId, userId, next) {
  const found = await tx.execute({
    sql: 'SELECT * FROM orders WHERE order_id = ?',
    args: [orderId]
  })
  const order = found.rows[0]
  if (!order || (order.buyer_id !== userId && order.seller_id !== userId)) {
    return { error: 'not_found', code: 404 }
  }

  const role = order.seller_id === userId ? 'seller' : 'buyer'
  const allowed = TRANSITIONS[order.status]?.[next]
  if (!allowed) return { error: 'invalid_transition', code: 409 }
  if (allowed !== 'both' && allowed !== role) return { error: 'forbidden', code: 403 }

  if (next === 'accepted') {
    const s = await tx.execute({
      sql: 'UPDATE inventory_lines SET stock = stock - ? WHERE line_id = ? AND stock >= ?',
      args: [order.amount, order.line_id, order.amount]
    })
    if (s.rowsAffected === 0) return { error: 'insufficient_stock', code: 409 }
  } else if (order.status === 'accepted' && next === 'cancelled') {
    await tx.execute({
      sql: 'UPDATE inventory_lines SET stock = stock + ? WHERE line_id = ?',
      args: [order.amount, order.line_id]
    })
  }

  const u = await tx.execute({
    sql: `UPDATE orders SET status = ?, updated_at = unixepoch()
          WHERE order_id = ? AND status = ? RETURNING *`,
    args: [next, orderId, order.status]
  })
  if (!u.rows[0]) return { error: 'invalid_transition', code: 409 } // otro cambio se coló
  return { order: { ...u.rows[0] } }
}

// Cambiar el estado de un pedido
router.patch('/:id/status', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' })
  const parsed = statusSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues })
  }

  let result
  const tx = await db.transaction('write')
  try {
    result = await changeStatus(tx, id, req.userId, parsed.data.status)
    if (result.error) await tx.rollback()
    else await tx.commit()
  } catch (err) {
    await tx.rollback().catch(() => { })
    throw err
  } finally {
    tx.close()
  }

  if (result.error) return res.status(result.code).json({ error: result.error })
  res.json(result.order)
})

const reviewSchema = z.object({
  rating: z.enum(['positive', 'neutral', 'negative']),
  comment: z.string().trim().max(500).nullish()
})
const SCORE = { positive: 1, neutral: 0, negative: -1 }

async function createReview(tx, orderId, userId, { rating, comment }) {
  const found = await tx.execute({
    sql: 'SELECT * FROM orders WHERE order_id = ?',
    args: [orderId]
  })
  const order = found.rows[0]
  if (!order || (order.buyer_id !== userId && order.seller_id !== userId)) {
    return { error: 'not_found', code: 404 }
  }
  if (order.status !== 'completed') return { error: 'order_not_completed', code: 409 }

  const revieweeId = order.buyer_id === userId ? order.seller_id : order.buyer_id
  const score = SCORE[rating]

  const ins = await tx.execute({
    sql: `INSERT INTO reviews (order_id, reviewer_id, reviewee_id, rating, comment)
          VALUES (?, ?, ?, ?, ?)
          RETURNING review_id, order_id, rating, comment, created_at`,
    args: [orderId, userId, revieweeId, score, comment ?? null]
  })
  if (score !== 0) {
    await tx.execute({
      sql: 'UPDATE users SET reputation = reputation + ? WHERE user_id = ?',
      args: [score, revieweeId]
    })
  }
  return { review: { ...ins.rows[0] } }
}

// Calificar a la otra parte de un pedido completado
router.post('/:id/review', async (req, res) => {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' })
  const parsed = reviewSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues })
  }

  let result
  const tx = await db.transaction('write')
  try {
    result = await createReview(tx, id, req.userId, parsed.data)
    if (result.error) await tx.rollback()
    else await tx.commit()
  } catch (err) {
    await tx.rollback().catch(() => { })
    if (String(err.message).includes('UNIQUE')) {
      return res.status(409).json({ error: 'already_reviewed' })
    }
    throw err
  } finally {
    tx.close()
  }

  if (result.error) return res.status(result.code).json({ error: result.error })
  res.status(201).json(result.review)
})

export default router