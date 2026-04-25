import crypto from 'node:crypto'
import express from 'express'
import {
  authenticateCustomer,
  createCustomerAccount,
  createCustomerSession,
  destroyCustomerSession,
  updateCustomerProfile,
  requireCustomer,
} from '../lib/customerAuth.js'
import { createRateLimiter, escapeHtml } from '../lib/security.js'
import { readStore, writeStore } from '../lib/store.js'
import {
  validateCheckoutPayload,
  validateContactPayload,
  validateCustomerLoginPayload,
  validateCustomerProfilePayload,
  validateCustomerSignupPayload,
} from '../lib/validators.js'
import {
  applyTransactionToOrder,
  buildReference,
  normalizeCurrencyAmount,
  paystackRequest,
} from '../services/paystack.js'

const router = express.Router()
const contactLimiter = createRateLimiter({
  windowMs: 1000 * 60 * 10,
  maxRequests: 6,
  keyPrefix: 'contact',
})
const checkoutLimiter = createRateLimiter({
  windowMs: 1000 * 60 * 5,
  maxRequests: 12,
  keyPrefix: 'checkout',
})
const deliveryFees = {
  pickup: 0,
  delivery: 150,
}

function getFrontendUrl(request) {
  if (process.env.FRONTEND_URL?.trim()) {
    return process.env.FRONTEND_URL.trim().replace(/\/$/, '')
  }

  const host = request.get('host') || ''
  if (host.endsWith(':3000')) {
    return `${request.protocol}://${host.replace(':3000', ':5173')}`
  }

  return `${request.protocol}://${host}`
}

router.get('/health', (_request, response) => {
  response.json({ ok: true })
})

router.get('/products', async (_request, response) => {
  const store = await readStore()
  response.json({ products: store.products })
})

router.post('/auth/signup', async (request, response) => {
  const errors = validateCustomerSignupPayload(request.body)

  if (errors.length > 0) {
    return response.status(400).json({ message: errors.join(' ') })
  }

  try {
    const user = await createCustomerAccount(request.body)
    const token = createCustomerSession(user)
    return response.status(201).json({ ok: true, token, user })
  } catch (error) {
    return response.status(400).json({
      message: error instanceof Error ? error.message : 'Unable to create account.',
    })
  }
})

router.post('/auth/login', async (request, response) => {
  const errors = validateCustomerLoginPayload(request.body)

  if (errors.length > 0) {
    return response.status(400).json({ message: errors.join(' ') })
  }

  try {
    const user = await authenticateCustomer(request.body.email, request.body.password)
    const token = createCustomerSession(user)
    return response.json({ ok: true, token, user })
  } catch (error) {
    return response.status(401).json({
      message: error instanceof Error ? error.message : 'Unable to log in.',
    })
  }
})

router.get('/auth/session', requireCustomer, async (request, response) => {
  response.json({
    ok: true,
    user: request.customer,
    session: request.customerSession,
  })
})

router.patch('/auth/profile', requireCustomer, async (request, response) => {
  const errors = validateCustomerProfilePayload(request.body)

  if (errors.length > 0) {
    return response.status(400).json({ message: errors.join(' ') })
  }

  try {
    const user = await updateCustomerProfile(request.customer.id, request.body)
    return response.json({ ok: true, user })
  } catch (error) {
    return response.status(400).json({
      message: error instanceof Error ? error.message : 'Unable to update profile.',
    })
  }
})

router.post('/auth/logout', requireCustomer, async (request, response) => {
  destroyCustomerSession(request.customerToken)
  response.json({ ok: true })
})

router.get('/account/orders', requireCustomer, async (request, response) => {
  const store = await readStore()
  const orders = store.orders.filter(
    (order) => order.customerId === request.customer.id || order.customer?.account?.userId === request.customer.id
  )
  response.json({ ok: true, orders })
})

router.post('/contact', contactLimiter, async (request, response) => {
  const errors = validateContactPayload(request.body)

  if (errors.length > 0) {
    return response.status(400).json({ message: errors.join(' ') })
  }

  const { name, email, phone, subject, message } = request.body || {}
  const resendApiKey = process.env.RESEND_API_KEY?.trim()
  const resendFromEmail = process.env.RESEND_FROM_EMAIL?.trim()
  const contactToEmail = process.env.CONTACT_TO_EMAIL?.trim()

  if (!resendApiKey || !resendFromEmail || !contactToEmail) {
    return response.status(500).json({
      message: 'Resend contact email is not configured. Set RESEND_API_KEY, RESEND_FROM_EMAIL, and CONTACT_TO_EMAIL.',
    })
  }

  try {
    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: resendFromEmail,
        to: [contactToEmail],
        subject: `Contact Form: ${subject.trim()}`,
        reply_to: email.trim(),
        html: `
          <div>
            <h2>New Contact Form Submission</h2>
            <p><strong>Name:</strong> ${escapeHtml(name.trim())}</p>
            <p><strong>Email:</strong> ${escapeHtml(email.trim())}</p>
            <p><strong>Phone:</strong> ${escapeHtml((phone || '').trim() || 'Not provided')}</p>
            <p><strong>Subject:</strong> ${escapeHtml(subject.trim())}</p>
            <p><strong>Message:</strong></p>
            <p>${escapeHtml(message.trim()).replace(/\n/g, '<br />')}</p>
          </div>
        `,
        text: [
          'New Contact Form Submission',
          `Name: ${name.trim()}`,
          `Email: ${email.trim()}`,
          `Phone: ${(phone || '').trim() || 'Not provided'}`,
          `Subject: ${subject.trim()}`,
          'Message:',
          message.trim(),
        ].join('\n'),
      }),
    })

    const resendData = await resendResponse.json()

    if (!resendResponse.ok) {
      return response.status(502).json({
        message: resendData?.message || 'Unable to send contact email through Resend.',
      })
    }

    return response.json({
      ok: true,
      id: resendData.id,
      message: 'Your message has been sent successfully.',
    })
  } catch (error) {
    return response.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to send contact email.',
    })
  }
})

router.post('/paystack/initialize', checkoutLimiter, requireCustomer, async (request, response) => {
  const errors = validateCheckoutPayload(request.body)

  if (errors.length > 0) {
    return response.status(400).json({ message: errors.join(' ') })
  }

  const { customer, cart, totals, callbackUrl } = request.body
  const deliveryMethod = customer.deliveryMethod === 'delivery' ? 'delivery' : 'pickup'
  const deliveryFee = deliveryFees[deliveryMethod]
  const subtotal = Number(totals.subtotal)
  const total = Number((subtotal + deliveryFee).toFixed(2))
  const reference = buildReference()
  const amountKobo = normalizeCurrencyAmount(total)
  const store = await readStore()

  const orderRecord = {
    id: crypto.randomUUID(),
    reference,
    customerId: request.customer.id,
    customer: {
      name: customer.name.trim(),
      email: request.customer.email,
      phone: customer.phone.trim(),
      address: deliveryMethod === 'delivery' ? customer.address.trim() : '',
      deliveryMethod,
      account: {
        userId: request.customer.id,
        email: request.customer.email,
      },
    },
    cart: cart.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      price: Number(item.price),
      quantity: Number(item.quantity),
      unit: item.unit,
    })),
    totals: {
      subtotal,
      deliveryFee,
      total,
    },
    amountKobo,
    paymentStatus: 'initialized',
    orderStatus: 'awaiting_payment',
    createdAt: new Date().toISOString(),
    paidAt: null,
    gatewayResponse: null,
    retryOf: null,
    lastCheckedAt: null,
  }

  store.orders.unshift(orderRecord)
  await writeStore(store)

  try {
    const paystackResponse = await paystackRequest('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: orderRecord.customer.email,
        amount: String(amountKobo),
        currency: 'GHS',
        reference,
        callback_url: callbackUrl,
        metadata: {
          customerName: orderRecord.customer.name,
          customerPhone: orderRecord.customer.phone,
          deliveryAddress: orderRecord.customer.address,
          deliveryMethod,
          orderTotal: orderRecord.totals.total,
          cartCount: orderRecord.cart.length,
          orderId: orderRecord.id,
        },
      }),
    })

    return response.json({
      authorizationUrl: paystackResponse.data.authorization_url,
      accessCode: paystackResponse.data.access_code,
      reference,
    })
  } catch (error) {
    const rollbackStore = await readStore()
    rollbackStore.orders = rollbackStore.orders.filter((order) => order.reference !== reference)
    await writeStore(rollbackStore)

    return response.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to initialize payment.',
    })
  }
})

router.get('/paystack/verify/:reference', requireCustomer, async (request, response) => {
  const { reference } = request.params
  const store = await readStore()
  const order = store.orders.find((entry) => entry.reference === reference)

  if (!order) {
    return response.status(404).json({ message: 'Order reference not found.' })
  }

  if (order.customerId !== request.customer.id && order.customer?.account?.userId !== request.customer.id) {
    return response.status(403).json({ message: 'You can only view your own orders.' })
  }

  try {
    const paystackResponse = await paystackRequest(`/transaction/verify/${reference}`, {
      method: 'GET',
    })

    const transaction = paystackResponse.data
    const { amountMatches, ok } = applyTransactionToOrder(order, transaction)

    await writeStore(store)

    return response.json({
      ok,
      reference,
      paymentStatus: transaction.status,
      paidAt: transaction.paid_at || null,
      gatewayResponse: transaction.gateway_response || null,
      amount: transaction.amount,
      amountMatches,
      order,
    })
  } catch (error) {
    return response.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to verify payment.',
    })
  }
})

router.post('/paystack/retry/:reference', requireCustomer, async (request, response) => {
  const { reference } = request.params
  const store = await readStore()
  const previousOrder = store.orders.find((entry) => entry.reference === reference)

  if (!previousOrder) {
    return response.status(404).json({ message: 'Order reference not found.' })
  }

  if (
    previousOrder.customerId !== request.customer.id &&
    previousOrder.customer?.account?.userId !== request.customer.id
  ) {
    return response.status(403).json({ message: 'You can only retry your own orders.' })
  }

  const retryStatuses = ['failed', 'abandoned', 'reversed', 'payment_issue']
  if (!retryStatuses.includes(previousOrder.paymentStatus) && previousOrder.orderStatus !== 'payment_issue') {
    return response.status(400).json({ message: 'This order is not in a retryable payment state.' })
  }

  const nextReference = buildReference()
  const retryOrder = {
    ...previousOrder,
    id: crypto.randomUUID(),
    reference: nextReference,
    paymentStatus: 'initialized',
    orderStatus: 'awaiting_payment',
    createdAt: new Date().toISOString(),
    paidAt: null,
    gatewayResponse: null,
    retryOf: previousOrder.reference,
    lastCheckedAt: null,
  }

  store.orders.unshift(retryOrder)
  await writeStore(store)

  try {
    const paystackResponse = await paystackRequest('/transaction/initialize', {
      method: 'POST',
      body: JSON.stringify({
        email: retryOrder.customer.email,
        amount: String(retryOrder.amountKobo),
        currency: 'GHS',
        reference: nextReference,
        callback_url: `${getFrontendUrl(request)}/order-status`,
        metadata: {
          customerName: retryOrder.customer.name,
          customerPhone: retryOrder.customer.phone,
          deliveryAddress: retryOrder.customer.address,
          deliveryMethod: retryOrder.customer.deliveryMethod || 'pickup',
          orderTotal: retryOrder.totals.total,
          cartCount: retryOrder.cart.length,
          orderId: retryOrder.id,
          retryOf: previousOrder.reference,
        },
      }),
    })

    return response.json({
      authorizationUrl: paystackResponse.data.authorization_url,
      accessCode: paystackResponse.data.access_code,
      reference: nextReference,
    })
  } catch (error) {
    const rollbackStore = await readStore()
    rollbackStore.orders = rollbackStore.orders.filter((order) => order.reference !== nextReference)
    await writeStore(rollbackStore)

    return response.status(500).json({
      message: error instanceof Error ? error.message : 'Unable to retry payment.',
    })
  }
})

export default router
