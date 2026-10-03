// mm-sc/server/src/index.js
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import compression from 'compression'
import cors from 'cors'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'
import { db } from './db/client.js'
import authRoutes from './routes/auth.js'
import inventoryRoutes from './routes/inventories.js'
import publicRoutes from './routes/public.js'
import orderRoutes from './routes/orders.js'
import { errorHandler } from './middleware/errors.js'

const app = express()

// Cliente compilado (client/dist). Si existe, Express lo sirve junto con la API (un solo origen).
const clientDist = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../client/dist')
const serveClient = fs.existsSync(path.join(clientDist, 'index.html'))

// Detrás del proxy de Render: confía en el primer salto para req.ip / req.protocol
app.set('trust proxy', 1)

app.use(compression())
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      // Avatares de Discord e imágenes de inventario con URL externa
      'img-src': ["'self'", 'data:', 'https:']
    }
  }
}))
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }))
app.use(express.json())
app.use(cookieParser())

// Chequeo liviano para la plataforma (no toca la base de datos)
app.get('/healthz', (req, res) => res.type('text').send('ok'))
if (!serveClient) app.get('/', (req, res) => res.json({ name: 'MM-SC API', ok: true }))
app.get('/api/health', async (req, res) => {
  try {
    await db.execute('SELECT 1')
    res.json({ ok: true, db: 'up' })
  } catch (err) {
    console.error(err)
    res.status(500).json({ ok: false, db: 'down' })
  }
})

app.use('/api/auth', authRoutes)
app.use('/api/inventories', inventoryRoutes)
app.use('/api/public', publicRoutes)
app.use('/api/orders', orderRoutes)

// Cualquier /api desconocido responde 404 en JSON (no cae en el index.html del cliente)
app.use('/api', (req, res) => res.status(404).json({ error: 'not_found' }))

if (serveClient) {
  // Archivos con hash en el nombre: cache de un año
  app.use('/assets', express.static(path.join(clientDist, 'assets'), { immutable: true, maxAge: '1y' }))
  app.use(express.static(clientDist, { index: false, maxAge: '1d' }))
  // Fallback de la SPA (vue-router en modo history): index.html sin cache
  app.get('/{*splat}', (req, res) => {
    res.set('Cache-Control', 'no-cache')
    res.sendFile(path.join(clientDist, 'index.html'))
  })
}

app.use(errorHandler)

// Que un error suelto quede en el log en vez de tumbar el proceso en silencio
process.on('unhandledRejection', err => console.error('[unhandledRejection]', err))

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`MM-SC en http://localhost:${port}${serveClient ? ' (API + cliente)' : ' (solo API)'}`))