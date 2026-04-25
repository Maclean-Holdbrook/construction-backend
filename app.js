import 'dotenv/config'
import express from 'express'
import publicRoutes from './routes/public.js'
import adminRoutes from './routes/admin.js'

function normalizeOrigin(value) {
  return (value || '').trim().replace(/\/$/, '')
}

function getAllowedOrigins() {
  return [
    normalizeOrigin(process.env.FRONTEND_URL),
    ...(process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => normalizeOrigin(value))
      .filter(Boolean),
  ]
}

function isAllowedVercelOrigin(origin) {
  return /^https:\/\/([a-z0-9-]+\.)*vercel\.app$/i.test(origin)
}

function applyCors(request, response) {
  const origin = normalizeOrigin(request.get('origin'))
  const allowedOrigins = getAllowedOrigins()

  if (!origin) {
    return
  }

  if (allowedOrigins.length === 0 || allowedOrigins.includes(origin) || isAllowedVercelOrigin(origin)) {
    response.setHeader('Access-Control-Allow-Origin', origin)
    response.setHeader('Vary', 'Origin')
    response.setHeader('Access-Control-Allow-Credentials', 'true')
    response.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type')
    response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS')
  }
}

export function createApp() {
  const app = express()

  app.disable('x-powered-by')
  app.set('trust proxy', true)

  app.use((request, response, next) => {
    applyCors(request, response)

    if (request.method === 'OPTIONS') {
      return response.status(204).end()
    }

    return next()
  })

  app.use(express.json({ limit: '1mb' }))
  app.use('/api', publicRoutes)
  app.use('/api', adminRoutes)

  return app
}
