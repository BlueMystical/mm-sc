// mm-sc/server/src/routes/inventories.js
import { Router } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { db } from '../db/client.js'
import { requireAuth } from '../middleware/auth.js'
import linesRoutes from './lines.js'

const router = Router()
router.use(requireAuth)
router.use('/:id/lines', linesRoutes)

const inventorySchema = z.object({
  title: z.string().trim().min(1).max(100),
  description: z.string().trim().max(1000).nullish(),
  location: z.string().trim().max(100).nullish(),
  image_url: z.string().trim().max(500).url()
    .refine(u => u.startsWith('https://'), 'must be an https URL').nullish(),
  visibility: z.enum(['private', 'unlisted', 'public']).optional()
})
const updateSchema = inventorySchema.partial()

function parseId(req, res) {
  const id = Number(req.params.id)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'invalid_id' })
    return null
  }
  return id
}

// Crear inventario
router.post('/', async (req, res) => {
  const parsed = inventorySchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues })
  }
  const { title, description, location, image_url, visibility = 'private' } = parsed.data
  const shareToken = crypto.randomBytes(12).toString('base64url')

  const r = await db.execute({
    sql: `INSERT INTO inventories (share_token, user_id, title, description, location, image_url, visibility)
          VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [shareToken, req.userId, title, description ?? null, location ?? null, image_url ?? null, visibility]
  })
  res.status(201).json({ ...r.rows[0] })
})

// Listar mis inventarios
router.get('/', async (req, res) => {
  const r = await db.execute({
    sql: `SELECT i.*,
                 (SELECT COUNT(*) FROM inventory_lines l
                   WHERE l.inventory_id = i.inventory_id) AS line_count
          FROM inventories i
          WHERE i.user_id = ?
          ORDER BY i.updated_at DESC`,
    args: [req.userId]
  })
  res.json(r.rows.map(row => ({ ...row })))
})

// Ver uno de mis inventarios
router.get('/:id', async (req, res) => {
  const id = parseId(req, res)
  if (id === null) return
  const r = await db.execute({
    sql: 'SELECT * FROM inventories WHERE inventory_id = ? AND user_id = ?',
    args: [id, req.userId]
  })
  if (!r.rows[0]) return res.status(404).json({ error: 'not_found' })
  res.json({ ...r.rows[0] })
})

// Editar
router.patch('/:id', async (req, res) => {
  const id = parseId(req, res)
  if (id === null) return
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues })
  }
  const data = parsed.data
  const keys = Object.keys(data)
  if (keys.length === 0) return res.status(400).json({ error: 'nothing_to_update' })

  const sets = keys.map(k => `${k} = ?`).join(', ')
  const args = [...keys.map(k => data[k] ?? null), id, req.userId]

  const r = await db.execute({
    sql: `UPDATE inventories SET ${sets}, updated_at = unixepoch()
          WHERE inventory_id = ? AND user_id = ? RETURNING *`,
    args
  })
  if (!r.rows[0]) return res.status(404).json({ error: 'not_found' })
  res.json({ ...r.rows[0] })
})

// Eliminar
router.delete('/:id', async (req, res) => {
  const id = parseId(req, res)
  if (id === null) return
  try {
    const r = await db.execute({
      sql: 'DELETE FROM inventories WHERE inventory_id = ? AND user_id = ?',
      args: [id, req.userId]
    })
    if (r.rowsAffected === 0) return res.status(404).json({ error: 'not_found' })
    res.status(204).end()
  } catch (err) {
    if (String(err.message).includes('FOREIGN KEY')) {
      return res.status(409).json({
        error: 'has_orders',
        message: 'The inventory has related orders. Make it private instead of deleting it.'
      })
    }
    throw err
  }
})

export default router