// mm-sc/server/src/middleware/errors.js

// Errores de red hacia la base (Turso): timeout, DNS, conexión rechazada o cortada
const NETWORK_CODES = new Set([
  'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_HEADERS_TIMEOUT', 'UND_ERR_SOCKET',
  'ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN'
])

function isDbUnavailable(err) {
  const code = err?.cause?.code ?? err?.code
  return NETWORK_CODES.has(code) || err?.message === 'fetch failed'
}

// Registrar con app.use(errorHandler) DESPUÉS de todas las rutas
export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err)

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'invalid_body' })
  }

  console.error(err)

  if (isDbUnavailable(err)) {
    return res.status(503).json({ error: 'db_unavailable' })
  }
  res.status(500).json({ error: 'server_error' })
}
