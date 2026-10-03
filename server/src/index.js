// mm-sc/server/src/index.js
import express from 'express'
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

app.use(helmet())
app.use(cors({ origin: process.env.CLIENT_ORIGIN, credentials: true }))
app.use(express.json())
app.use(cookieParser())

app.get('/', (req, res) => res.json({ name: 'MM-SC API', ok: true }))
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

app.use(errorHandler)

const port = process.env.PORT || 3000
app.listen(port, () => console.log(`API en http://localhost:${port}`))