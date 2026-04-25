export function buildReference() {
  const random = Math.random().toString(36).slice(2, 8).toUpperCase()
  return `BM-${Date.now()}-${random}`
}

export function normalizeCurrencyAmount(value) {
  return Math.round(Number(value) * 100)
}

export function deriveOrderStatus(paymentStatus, amountMatches) {
  if (paymentStatus === 'success' && amountMatches) {
    return 'paid'
  }

  if (['pending', 'processing', 'ongoing', 'queued'].includes(paymentStatus)) {
    return 'payment_pending'
  }

  if (['failed', 'abandoned', 'reversed'].includes(paymentStatus) || !amountMatches) {
    return 'payment_issue'
  }

  return 'awaiting_payment'
}

export function applyTransactionToOrder(order, transaction) {
  const amountMatches = order.amountKobo === transaction.amount

  order.paymentStatus = transaction.status
  order.gatewayResponse = transaction.gateway_response || null
  order.paidAt = transaction.paid_at || null
  order.orderStatus = deriveOrderStatus(transaction.status, amountMatches)
  order.lastCheckedAt = new Date().toISOString()

  return {
    amountMatches,
    ok: transaction.status === 'success' && amountMatches,
  }
}

export async function paystackRequest(pathname, options = {}) {
  const secretKey = process.env.PAYSTACK_SECRET_KEY

  if (!secretKey) {
    throw new Error('PAYSTACK_SECRET_KEY is missing. Add it to your .env file before using checkout.')
  }

  const response = await fetch(`https://api.paystack.co${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  })

  const data = await response.json()

  if (!response.ok || !data.status) {
    throw new Error(data.message || 'Paystack request failed.')
  }

  return data
}
