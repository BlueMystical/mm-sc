import jwt from 'jsonwebtoken'

export function requireAuth(req, res, next) {
  const token = req.cookies.token
  if (!token) return res.status(401).json({ error: 'unauthorized' })
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] })
    req.userId = payload.uid
    next()
  } catch {
    res.status(401).json({ error: 'unauthorized' })
  }
}