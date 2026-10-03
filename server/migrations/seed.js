// server/migrations/seed.js
// Crea inventarios y líneas de PRUEBA para los usuarios que ya existen.
//   node --env-file=.env scripts/seed.js           -> inserta datos de prueba
//   node --env-file=.env scripts/seed.js --clean   -> borra lo que insertó este script
// Todo lo sembrado lleva "[seed]" al inicio de la descripción, así se puede limpiar.
import crypto from 'node:crypto'
import { db } from '../src/db/client.js'
import { getCommodities } from '../src/services/uex.js'

const MARK = '[seed]'
const DAY = 86400

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a
const pick = arr => arr[rnd(0, arr.length - 1)]
const sample = (arr, n) => [...arr].sort(() => Math.random() - 0.5).slice(0, n)

if (process.argv.includes('--clean')) {
  try {
    const r = await db.execute({
      sql: 'DELETE FROM inventories WHERE description LIKE ?',
      args: [`${MARK}%`]
    })
    console.log(`Removed ${r.rowsAffected} seeded inventories (their lines are removed by cascade).`)
  } catch (err) {
    console.error('Could not clean up (some seeded line probably has orders):', err.message)
    process.exitCode = 1
  }
  process.exit()
}

// --- Usuarios existentes ---
const users = (await db.execute('SELECT user_id, user_name FROM users ORDER BY user_id LIMIT 5')).rows
if (users.length === 0) {
  console.error('There are no users yet. Sign in once with Discord and run this again.')
  process.exit(1)
}

// --- Materiales: se buscan por nombre en el catálogo de UEX (no se fijan ids a mano) ---
const WANTED = {
  quantanium: 22000, bexalite: 7000, taranite: 9000, laranite: 3000, agricium: 2600,
  hephaestanite: 1400, titanium: 800, borase: 4500, gold: 5900, beryl: 3300,
  corundum: 2500, quartz: 1500, tungsten: 3000, aluminum: 1200, iron: 700, copper: 600
}
const all = [...(await getCommodities()).values()].filter(c => c.is_listable)
let pool = all.filter(c => Object.keys(WANTED).some(w => c.name.toLowerCase().startsWith(w)))
if (pool.length < 6) pool = all
console.log(`Using ${pool.length} materials, e.g.: ${pool.slice(0, 6).map(c => c.name).join(', ')}`)

// Precio inventado (solo para pruebas): base conocida ± variación, o aleatorio
function priceFor(item) {
  const key = Object.keys(WANTED).find(w => item.name.toLowerCase().startsWith(w))
  return key ? Math.round(WANTED[key] * (0.8 + Math.random() * 0.45)) : rnd(500, 9000)
}

// --- Plantillas ---
const LOCATIONS = ['Port Tressler', 'Area18', 'Lorville', 'New Babbage', 'Orison', 'Grim HEX', 'Everus Harbor', 'Seraphim Station', 'Baijini Point', 'Levski']
const TITLES = ['Fresh from the belt', 'Surplus ore, must go', 'Premium quality only', 'Bulk deals', 'Weekend haul', 'Cargo hold clearance']
const VISIBILITIES = ['public', 'public', 'public', 'unlisted', 'private']

let invCount = 0
let lineCount = 0

for (const user of users) {
  const titles = sample(TITLES, VISIBILITIES.length)

  for (let i = 0; i < VISIBILITIES.length; i++) {
    const token = crypto.randomBytes(12).toString('base64url')
    const updated = Math.floor(Date.now() / 1000) - rnd(0, 20 * DAY)
    // La última sin imagen, para probar el placeholder. Imágenes de picsum.photos (solo pruebas).
    const image = i === VISIBILITIES.length - 1 ? null : `https://picsum.photos/seed/${token}/640/360`

    const inv = await db.execute({
      sql: `INSERT INTO inventories
              (share_token, user_id, title, description, location, visibility, image_url, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING inventory_id`,
      args: [token, user.user_id, titles[i], `${MARK} Test data`, pick(LOCATIONS), VISIBILITIES[i], image, updated, updated]
    })
    const inventoryId = Number(inv.rows[0].inventory_id)

    const lines = sample(pool, rnd(3, 6)).map(item => ({
      sql: `INSERT INTO inventory_lines (inventory_id, item_id, quality, stock, price, is_visible)
            VALUES (?, ?, ?, ?, ?, ?)`,
      args: [
        inventoryId,
        item.id,
        rnd(1, 6) === 1 ? null : rnd(300, 1000),   // algunas sin calidad
        rnd(1, 10) === 1 ? 0 : rnd(5, 400),        // alguna sin stock (no debe salir en Explorar)
        priceFor(item),
        rnd(1, 8) === 1 ? 0 : 1                    // alguna oculta
      ]
    }))
    await db.batch(lines, 'write')

    invCount++
    lineCount += lines.length
  }
  console.log(`  ${user.user_name}: ${VISIBILITIES.length} inventories`)
}

console.log(`Done: ${invCount} inventories, ${lineCount} lines.`)
process.exit()