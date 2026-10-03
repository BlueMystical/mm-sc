// mm-sc/server/src/routes/lines.js
import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db/client.js'
import { getCommodities } from '../services/uex.js'

const router = Router({ mergeParams: true })

const lineSchema = z.object({
  item_id: z.number().int().positive(),
  quality: z.number().int().min(0).max(1000).nullish(),
  stock: z.number().int().min(0),   // SCU
  price: z.number().int().min(0),   // aUEC por SCU
  is_visible: z.boolean().optional()
})
const updateSchema = lineSchema.partial()

// Verifica que el inventario del path sea del usuario autenticado
router.use(async (req, res, next) => {
  const inventoryId = Number(req.params.id)
  if (!Number.isInteger(inventoryId) || inventoryId <= 0) {
    return res.status(400).json({ error: 'invalid_id' })
  }
  const r = await db.execute({
    sql: 'SELECT 1 FROM inventories WHERE inventory_id = ? AND user_id = ?',
    args: [inventoryId, req.userId]
  })
  if (!r.rows[0]) return res.status(404).json({ error: 'not_found' })
  req.inventoryId = inventoryId
  next()
})

function parseLineId(req, res) {
  const id = Number(req.params.lineId)
  if (!Number.isInteger(id) || id <= 0) {
    res.status(400).json({ error: 'invalid_id' })
    return null
  }
  return id
}

async function checkItem(itemId, res) {
  let commodities
  try {
    commodities = await getCommodities()
  } catch (err) {
    console.error(err)
    res.status(503).json({ error: 'catalog_unavailable' })
    return false
  }

  const item = commodities.get(itemId)
  if (!item) {
    res.status(400).json({ error: 'unknown_item_id' })
    return false
  }
  if (!item.is_listable) {
    res.status(400).json({ error: 'item_not_listable' })
    return false
  }
  return true
}

const touchInventory = inventoryId =>
  db.execute({
    sql: 'UPDATE inventories SET updated_at = unixepoch() WHERE inventory_id = ?',
    args: [inventoryId]
  })

// Listar líneas
router.get('/', async (req, res) => {
  const r = await db.execute({
    sql: 'SELECT * FROM inventory_lines WHERE inventory_id = ? ORDER BY line_id',
    args: [req.inventoryId]
  })
  const names = await getCommodities().catch(() => new Map())
  res.json(r.rows.map(l => ({ ...l, item_name: names.get(l.item_id)?.name ?? null })))
})

// Agregar línea
router.post('/', async (req, res) => {
  const parsed = lineSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues })
  }
  const d = parsed.data
  if (!(await checkItem(d.item_id, res))) return

  const r = await db.execute({
    sql: `INSERT INTO inventory_lines (inventory_id, item_id, quality, stock, price, is_visible)
          VALUES (?, ?, ?, ?, ?, ?) RETURNING *`,
    args: [req.inventoryId, d.item_id, d.quality ?? null, d.stock, d.price, d.is_visible === false ? 0 : 1]
  })
  await touchInventory(req.inventoryId)
  res.status(201).json({ ...r.rows[0] })
})

// Editar línea
router.patch('/:lineId', async (req, res) => {
  const lineId = parseLineId(req, res)
  if (lineId === null) return
  const parsed = updateSchema.safeParse(req.body)
  if (!parsed.success) {
    return res.status(400).json({ error: 'invalid_body', details: parsed.error.issues })
  }
  const data = parsed.data
  const keys = Object.keys(data)
  if (keys.length === 0) return res.status(400).json({ error: 'nothing_to_update' })
  if (data.item_id !== undefined && !(await checkItem(data.item_id, res))) return

  const sets = keys.map(k => `${k} = ?`).join(', ')
  const args = keys.map(k => (k === 'is_visible' ? (data[k] ? 1 : 0) : data[k] ?? null))

  const r = await db.execute({
    sql: `UPDATE inventory_lines SET ${sets}
          WHERE line_id = ? AND inventory_id = ? RETURNING *`,
    args: [...args, lineId, req.inventoryId]
  })
  if (!r.rows[0]) return res.status(404).json({ error: 'not_found' })
  await touchInventory(req.inventoryId)
  res.json({ ...r.rows[0] })
})

// Eliminar línea
router.delete('/:lineId', async (req, res) => {
  const lineId = parseLineId(req, res)
  if (lineId === null) return
  try {
    const r = await db.execute({
      sql: 'DELETE FROM inventory_lines WHERE line_id = ? AND inventory_id = ?',
      args: [lineId, req.inventoryId]
    })
    if (r.rowsAffected === 0) return res.status(404).json({ error: 'not_found' })
    await touchInventory(req.inventoryId)
    res.status(204).end()
  } catch (err) {
    if (String(err.message).includes('FOREIGN KEY')) {
      return res.status(409).json({
        error: 'has_orders',
        message: 'The line has related orders. Hide it with is_visible: false instead.'
      })
    }
    throw err
  }
})

export default router