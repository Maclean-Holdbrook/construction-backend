import 'dotenv/config'
import express from 'express'
import publicRoutes from './routes/public.js'
import adminRoutes from './routes/admin.js'

function getAllowedOrigins() {
  return [
    process.env.FRONTEND_URL?.trim(),
    ...(process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  ]
}

function applyCors(request, response) {
  const origin = request.get('origin')
  const allowedOrigins = getAllowedOrigins()

  if (!origin) {
    return
  }

  if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
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
