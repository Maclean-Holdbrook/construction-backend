function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isLikelyPhoneNumber(value) {
  return /^[+\d][\d\s-]{6,}$/.test(value)
}

function isStrongEnoughPassword(value) {
  return String(value || '').trim().length >= 8
}

function isSafeHttpUrl(value) {
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

export function validateCheckoutPayload(body) {
  const errors = []
  const deliveryMethod = body?.customer?.deliveryMethod

  if (!body?.customer?.name?.trim()) errors.push('Customer name is required.')
  if (!body?.customer?.email?.trim()) errors.push('Customer email is required.')
  if (body?.customer?.email?.trim() && !isValidEmail(body.customer.email.trim())) errors.push('Customer email is invalid.')
  if (!body?.customer?.phone?.trim()) errors.push('Customer phone number is required.')
  if (body?.customer?.phone?.trim() && !isLikelyPhoneNumber(body.customer.phone.trim())) errors.push('Customer phone number is invalid.')
  if (!['pickup', 'delivery'].includes(deliveryMethod)) errors.push('Delivery method is invalid.')
  if (deliveryMethod === 'delivery' && !body?.customer?.address?.trim()) errors.push('Delivery address is required.')
  if (!Array.isArray(body?.cart) || body.cart.length === 0) errors.push('Cart cannot be empty.')
  if (
    Array.isArray(body?.cart) &&
    body.cart.some(
      (item) =>
        !item?.id ||
        !item?.name?.trim() ||
        !Number.isFinite(Number(item?.price)) ||
        Number(item.price) <= 0 ||
        !Number.isInteger(Number(item?.quantity)) ||
        Number(item.quantity) <= 0
    )
  ) {
    errors.push('Cart items are invalid.')
  }
  if (!Number.isFinite(body?.totals?.subtotal) || body.totals.subtotal < 0) errors.push('Order subtotal is invalid.')
  if (!Number.isFinite(body?.totals?.deliveryFee) || body.totals.deliveryFee < 0) errors.push('Delivery fee is invalid.')
  if (!Number.isFinite(body?.totals?.total) || body.totals.total <= 0) errors.push('Order total is invalid.')
  if (
    Number.isFinite(body?.totals?.subtotal) &&
    Number.isFinite(body?.totals?.deliveryFee) &&
    Number.isFinite(body?.totals?.total) &&
    Number((body.totals.subtotal + body.totals.deliveryFee).toFixed(2)) !== Number(Number(body.totals.total).toFixed(2))
  ) {
    errors.push('Order totals do not match subtotal plus delivery fee.')
  }
  if (!body?.callbackUrl?.trim()) errors.push('Callback URL is required.')
  if (body?.callbackUrl?.trim() && !isSafeHttpUrl(body.callbackUrl.trim())) errors.push('Callback URL is invalid.')

  return errors
}

export function validateProductPayload(body) {
  const errors = []

  if (!body?.name?.trim()) errors.push('Product name is required.')
  if (!body?.category?.trim()) errors.push('Product category is required.')
  if (!Number.isFinite(Number(body?.price)) || Number(body.price) <= 0) errors.push('Product price is invalid.')
  if (!body?.unit?.trim()) errors.push('Sales unit is required.')
  if (!body?.badge?.trim()) errors.push('Badge is required.')
  if (!body?.stock?.trim()) errors.push('Stock status is required.')
  if (!body?.description?.trim()) errors.push('Description is required.')
  if (!body?.imageUrl?.trim()) errors.push('Image URL is required.')
  if (body?.imageUrl?.trim() && !isSafeHttpUrl(body.imageUrl.trim()) && !body.imageUrl.trim().startsWith('data:image/')) {
    errors.push('Image URL must be an http(s) URL or image data URL.')
  }

  return errors
}

export function validateContactPayload(body) {
  const errors = []

  if (!body?.name?.trim()) errors.push('Name is required.')
  if (!body?.email?.trim()) errors.push('Email is required.')
  if (body?.email?.trim() && !isValidEmail(body.email.trim())) errors.push('Email is invalid.')
  if (body?.phone?.trim() && !isLikelyPhoneNumber(body.phone.trim())) errors.push('Phone number is invalid.')
  if (!body?.subject?.trim()) errors.push('Subject is required.')
  if (!body?.message?.trim()) errors.push('Message is required.')
  if (body?.name?.trim()?.length > 120) errors.push('Name is too long.')
  if (body?.subject?.trim()?.length > 180) errors.push('Subject is too long.')
  if (body?.message?.trim()?.length > 4000) errors.push('Message is too long.')

  return errors
}

export function validateCustomerSignupPayload(body) {
  const errors = []

  if (!body?.name?.trim()) errors.push('Full name is required.')
  if (!body?.email?.trim()) errors.push('Email is required.')
  if (body?.email?.trim() && !isValidEmail(body.email.trim())) errors.push('Email is invalid.')
  if (!body?.phone?.trim()) errors.push('Phone number is required.')
  if (body?.phone?.trim() && !isLikelyPhoneNumber(body.phone.trim())) errors.push('Phone number is invalid.')
  if (!body?.address?.trim()) errors.push('Address is required.')
  if (!body?.password?.trim()) errors.push('Password is required.')
  if (body?.password?.trim() && !isStrongEnoughPassword(body.password)) {
    errors.push('Password must be at least 8 characters long.')
  }

  return errors
}

export function validateCustomerLoginPayload(body) {
  const errors = []

  if (!body?.email?.trim()) errors.push('Email is required.')
  if (body?.email?.trim() && !isValidEmail(body.email.trim())) errors.push('Email is invalid.')
  if (!body?.password?.trim()) errors.push('Password is required.')

  return errors
}

export function validateCustomerProfilePayload(body) {
  const errors = []

  if (!body?.name?.trim()) errors.push('Full name is required.')
  if (!body?.phone?.trim()) errors.push('Phone number is required.')
  if (body?.phone?.trim() && !isLikelyPhoneNumber(body.phone.trim())) errors.push('Phone number is invalid.')
  if (!body?.address?.trim()) errors.push('Address is required.')

  return errors
}

export function normalizeProduct(body, existingId) {
  return {
    id:
      existingId ||
      body.name
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, ''),
    name: body.name.trim(),
    category: body.category.trim(),
    price: Number(body.price),
    unit: body.unit.trim(),
    badge: body.badge.trim(),
    stock: body.stock.trim(),
    description: body.description.trim(),
    imageUrl: body.imageUrl.trim(),
  }
}
