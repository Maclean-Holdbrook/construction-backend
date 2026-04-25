import express from 'express'
import { createAdminSession, destroyAdminSession, getAdminCredentials, getAdminToken, requireAdmin } from '../lib/auth.js'
import { createRateLimiter } from '../lib/security.js'
import { readStore, writeStore } from '../lib/store.js'
import { normalizeProduct, validateProductPayload } from '../lib/validators.js'

const router = express.Router()
const allowedOrderStatuses = ['new', 'paid', 'processing', 'delivered', 'cancelled', 'awaiting_payment', 'payment_issue']
const adminLoginLimiter = createRateLimiter({
  windowMs: 1000 * 60 * 10,
  maxRequests: 8,
  keyPrefix: 'admin-login',
})

router.get('/orders', requireAdmin, async (_request, response) => {
  const store = await readStore()
  response.json({ orders: store.orders })
})

router.post('/admin/login', adminLoginLimiter, (request, response) => {
  const { username, password } = request.body || {}
  const adminCredentials = getAdminCredentials()

  if (username !== adminCredentials.username || password !== adminCredentials.password) {
    return response.status(401).json({ message: 'Invalid admin credentials.' })
  }

  const token = createAdminSession(username)
  return response.json({ token, username })
})

router.get('/admin/session', requireAdmin, (request, response) => {
  response.json({
    ok: true,
    session: request.adminSession,
  })
})

router.post('/admin/logout', requireAdmin, (request, response) => {
  const token = getAdminToken(request)
  if (token) {
    destroyAdminSession(token)
  }

  return response.json({ ok: true })
})

router.post('/admin/products', requireAdmin, async (request, response) => {
  const errors = validateProductPayload(request.body)

  if (errors.length > 0) {
    return response.status(400).json({ message: errors.join(' ') })
  }

  const store = await readStore()
  const product = normalizeProduct(request.body)

  if (store.products.some((item) => item.id === product.id)) {
    return response.status(409).json({ message: 'A product with this generated id already exists.' })
  }

  store.products.push(product)
  await writeStore(store)

  return response.status(201).json({ product })
})

router.put('/admin/products/:id', requireAdmin, async (request, response) => {
  const errors = validateProductPayload(request.body)

  if (errors.length > 0) {
    return response.status(400).json({ message: errors.join(' ') })
  }

  const store = await readStore()
  const index = store.products.findIndex((product) => product.id === request.params.id)

  if (index === -1) {
    return response.status(404).json({ message: 'Product not found.' })
  }

  const updatedProduct = normalizeProduct(request.body, store.products[index].id)
  store.products[index] = updatedProduct
  await writeStore(store)

  return response.json({ product: updatedProduct })
})

router.delete('/admin/products/:id', requireAdmin, async (request, response) => {
  const store = await readStore()
  const nextProducts = store.products.filter((product) => product.id !== request.params.id)

  if (nextProducts.length === store.products.length) {
    return response.status(404).json({ message: 'Product not found.' })
  }

  store.products = nextProducts
  await writeStore(store)

  return response.json({ ok: true })
})

router.patch('/admin/orders/:id/status', requireAdmin, async (request, response) => {
  const { orderStatus } = request.body || {}

  if (!allowedOrderStatuses.includes(orderStatus)) {
    return response.status(400).json({ message: 'Order status is invalid.' })
  }

  const store = await readStore()
  const order = store.orders.find((entry) => entry.id === request.params.id)

  if (!order) {
    return response.status(404).json({ message: 'Order not found.' })
  }

  order.orderStatus = orderStatus
  order.updatedAt = new Date().toISOString()
  await writeStore(store)

  return response.json({ order })
})

export default router
