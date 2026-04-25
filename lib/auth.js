import crypto from 'node:crypto'

const adminSessions = new Map()
const sessionTtlMs = Number(process.env.ADMIN_SESSION_TTL_MS || 1000 * 60 * 60 * 12)

export function getAdminCredentials() {
  return {
    username: process.env.ADMIN_USERNAME || 'admin',
    password: process.env.ADMIN_PASSWORD || 'buildmart123',
  }
}

export function getAdminToken(request) {
  const authHeader = request.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return ''
  }

  return authHeader.slice(7).trim()
}

export function createAdminSession(username) {
  purgeExpiredSessions()
  const token = crypto.randomUUID()
  adminSessions.set(token, {
    username,
    createdAt: Date.now(),
  })

  return token
}

export function destroyAdminSession(token) {
  adminSessions.delete(token)
}

function purgeExpiredSessions() {
  const now = Date.now()

  for (const [token, session] of adminSessions.entries()) {
    if (session.createdAt + sessionTtlMs <= now) {
      adminSessions.delete(token)
    }
  }
}

export function requireAdmin(request, response, next) {
  purgeExpiredSessions()
  const token = getAdminToken(request)

  if (!token || !adminSessions.has(token)) {
    return response.status(401).json({ message: 'Admin authorization required.' })
  }

  const session = adminSessions.get(token)
  request.adminSession = {
    ...session,
    createdAt: new Date(session.createdAt).toISOString(),
  }
  return next()
}
