// mm-sc/server/src/routes/public.js
import { Router } from 'express'
import { db } from '../db/client.js'
import { getCommodities } from '../services/uex.js'
import { z } from 'zod'

const router = Router()

// Catálogo de commodities (para el selector del cliente)
router.get('/commodities', async (req, res) => {
    try {
        const map = await getCommodities()
        res.json(
            [...map.values()]
                .filter(c => c.is_listable)
                .sort((a, b) => a.name.localeCompare(b.name))
        )
    } catch (err) {
        console.error(err)
        res.status(503).json({ error: 'catalog_unavailable' })
    }
})

// Inventario por link compartido (sin login)
router.get('/inventories/:token', async (req, res) => {
    const inv = await db.execute({
        sql: `SELECT i.inventory_id, i.share_token, i.title, i.description, i.location,
                 i.visibility, i.image_url, i.updated_at,
                 u.user_id AS seller_id, u.user_name AS seller_name,
                 u.avatar AS seller_avatar, u.reputation AS seller_reputation
          FROM inventories i
          JOIN users u ON u.user_id = i.user_id
          WHERE i.share_token = ? AND i.visibility IN ('unlisted', 'public')`,
        args: [req.params.token]
    })
    if (!inv.rows[0]) return res.status(404).json({ error: 'not_found' })

    const lines = await db.execute({
        sql: `SELECT line_id, item_id, quality, stock, price
          FROM inventory_lines
          WHERE inventory_id = ? AND is_visible = 1
          ORDER BY line_id`,
        args: [inv.rows[0].inventory_id]
    })
    const names = await getCommodities().catch(() => new Map())

    res.json({
        ...inv.rows[0],
        lines: lines.rows.map(l => ({ ...l, item_name: names.get(l.item_id)?.name ?? null }))
    })
})

const exploreSchema = z.object({
    item_id: z.string().regex(/^\d+(,\d+)*$/).optional(),   // uno o varios: "1,2"
    quality_min: z.coerce.number().int().min(0).max(1000).optional(),
    price_min: z.coerce.number().int().min(0).optional(),
    price_max: z.coerce.number().int().min(0).optional(),
    location: z.string().trim().max(100).optional(),
    seller_id: z.coerce.number().int().positive().optional(),   // ofertas de un vendedor (perfil)
    sort: z.enum(['price_asc', 'price_desc', 'quality_desc', 'recent', 'reputation'])
        .default('price_asc'),
    page: z.coerce.number().int().min(1).default(1),
    page_size: z.coerce.number().int().min(1).max(50).default(20)
})

// Valores fijos: lo que llega del cliente solo elige la clave, nunca se interpola
const ORDER = {
    price_asc: 'l.price ASC, l.line_id',
    price_desc: 'l.price DESC, l.line_id',
    quality_desc: 'l.quality DESC, l.price ASC',
    recent: 'i.updated_at DESC, l.line_id',
    reputation: 'u.reputation DESC, l.price ASC'
}

// Explorar ofertas en inventarios públicos
router.get('/explore', async (req, res) => {
    const parsed = exploreSchema.safeParse(req.query)
    if (!parsed.success) {
        return res.status(400).json({ error: 'invalid_query', details: parsed.error.issues })
    }
    const q = parsed.data

    const where = ["i.visibility = 'public'", 'l.is_visible = 1', 'l.stock > 0']
    const args = []

    if (q.item_id) {
        const ids = [...new Set(q.item_id.split(',').map(Number))].slice(0, 50)
        where.push(`l.item_id IN (${ids.map(() => '?').join(',')})`)
        args.push(...ids)
    }
    if (q.quality_min !== undefined) { where.push('l.quality >= ?'); args.push(q.quality_min) }
    if (q.price_min !== undefined) { where.push('l.price >= ?'); args.push(q.price_min) }
    if (q.price_max !== undefined) { where.push('l.price <= ?'); args.push(q.price_max) }
    if (q.seller_id !== undefined) { where.push('u.user_id = ?'); args.push(q.seller_id) }
    if (q.location) {
        where.push("i.location LIKE ? ESCAPE '\\'")
        args.push(`%${q.location.replace(/[\\%_]/g, '\\$&')}%`)
    }

    const from = `
    FROM inventory_lines l
    JOIN inventories i ON i.inventory_id = l.inventory_id
    JOIN users u ON u.user_id = i.user_id
    WHERE ${where.join(' AND ')}`

    const [count, rows] = await Promise.all([
        db.execute({ sql: `SELECT COUNT(*) AS total ${from}`, args }),
        db.execute({
            sql: `SELECT l.line_id, l.item_id, l.quality, l.stock, l.price,
                   i.inventory_id, i.share_token, i.title, i.location, i.image_url, i.updated_at,
                   u.user_id AS seller_id, u.user_name AS seller_name,
                   u.avatar AS seller_avatar, u.reputation AS seller_reputation
            ${from}
            ORDER BY ${ORDER[q.sort]}
            LIMIT ? OFFSET ?`,
            args: [...args, q.page_size, (q.page - 1) * q.page_size]
        })
    ])

    const names = await getCommodities().catch(() => new Map())
    res.json({
        total: Number(count.rows[0].total),
        page: q.page,
        page_size: q.page_size,
        results: rows.rows.map(r => ({ ...r, item_name: names.get(r.item_id)?.name ?? null }))
    })
})

// Perfil público: reputación, estadísticas y últimas calificaciones
router.get('/users/:id', async (req, res) => {
    const id = Number(req.params.id)
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid_id' })

    const u = await db.execute({
        sql: 'SELECT user_id, user_name, avatar, reputation, created_at FROM users WHERE user_id = ?',
        args: [id]
    })
    if (!u.rows[0]) return res.status(404).json({ error: 'not_found' })

    const [ratings, orders, recent] = await Promise.all([
        db.execute({
            sql: `SELECT COALESCE(SUM(rating = 1), 0)  AS positive,
                   COALESCE(SUM(rating = 0), 0)  AS neutral,
                   COALESCE(SUM(rating = -1), 0) AS negative
            FROM reviews WHERE reviewee_id = ?`,
            args: [id]
        }),
        db.execute({
            sql: `SELECT COALESCE(SUM(seller_id = ?), 0) AS sales,
                   COALESCE(SUM(buyer_id = ?), 0)  AS purchases
            FROM orders
            WHERE status = 'completed' AND (seller_id = ? OR buyer_id = ?)`,
            args: [id, id, id, id]
        }),
        db.execute({
            sql: `SELECT r.rating, r.comment, r.created_at,
                   rv.user_name AS reviewer_name, rv.avatar AS reviewer_avatar
            FROM reviews r
            JOIN users rv ON rv.user_id = r.reviewer_id
            WHERE r.reviewee_id = ?
            ORDER BY r.created_at DESC
            LIMIT 20`,
            args: [id]
        })
    ])

    res.json({
        ...u.rows[0],
        ratings: {
            positive: Number(ratings.rows[0].positive),
            neutral: Number(ratings.rows[0].neutral),
            negative: Number(ratings.rows[0].negative)
        },
        completed_sales: Number(orders.rows[0].sales),
        completed_purchases: Number(orders.rows[0].purchases),
        recent_reviews: recent.rows.map(r => ({ ...r }))
    })
})

export default router