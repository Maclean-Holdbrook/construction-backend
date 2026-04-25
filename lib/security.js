const requestBuckets = new Map()

function getClientAddress(request) {
  const forwardedFor = request.headers['x-forwarded-for']

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim()
  }

  return request.ip || request.socket?.remoteAddress || 'unknown'
}

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

export function createRateLimiter({ windowMs, maxRequests, keyPrefix }) {
  return function rateLimit(request, response, next) {
    const clientKey = `${keyPrefix}:${getClientAddress(request)}`
    const now = Date.now()
    const existing = requestBuckets.get(clientKey)

    if (!existing || existing.resetAt <= now) {
      requestBuckets.set(clientKey, {
        count: 1,
        resetAt: now + windowMs,
      })
      return next()
    }

    if (existing.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((existing.resetAt - now) / 1000))
      response.setHeader('Retry-After', String(retryAfterSeconds))
      return response.status(429).json({
        message: 'Too many requests. Please wait and try again.',
      })
    }

    existing.count += 1
    return next()
  }
}
