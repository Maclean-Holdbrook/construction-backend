import crypto from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase.js'

const sessionTtlMs = Number(process.env.CUSTOMER_SESSION_TTL_MS || 1000 * 60 * 60 * 24 * 7)
const sessionSecret = process.env.CUSTOMER_SESSION_SECRET?.trim() || 'buildmart-customer-session-secret'
const accountsFilePath = path.join(process.cwd(), 'backend', 'data', 'customers.json')
const defaultAccounts = {
  users: [],
}

let writeQueue = Promise.resolve()

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function getBearerToken(request) {
  const authHeader = request.headers.authorization || ''
  if (!authHeader.startsWith('Bearer ')) {
    return ''
  }

  return authHeader.slice(7).trim()
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  const digest = crypto.scryptSync(password, salt, 64).toString('hex')
  return `${salt}:${digest}`
}

function verifyPassword(password, passwordHash) {
  const [salt, storedDigest] = String(passwordHash || '').split(':')
  if (!salt || !storedDigest) {
    return false
  }

  const digest = crypto.scryptSync(password, salt, 64).toString('hex')
  return crypto.timingSafeEqual(Buffer.from(digest, 'hex'), Buffer.from(storedDigest, 'hex'))
}

function sanitizeUser(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt || null,
  }
}

function normalizeCustomerRow(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    address: row.address,
    passwordHash: row.password_hash,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function toCustomerRow(user) {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: user.phone,
    address: user.address,
    password_hash: user.passwordHash,
    created_at: user.createdAt,
    updated_at: user.updatedAt || null,
  }
}

async function ensureAccountsFile() {
  await fs.mkdir(path.dirname(accountsFilePath), { recursive: true })

  try {
    await fs.access(accountsFilePath)
  } catch {
    await fs.writeFile(accountsFilePath, `${JSON.stringify(defaultAccounts, null, 2)}\n`, 'utf8')
  }
}

async function readLocalAccounts() {
  await ensureAccountsFile()
  const raw = await fs.readFile(accountsFilePath, 'utf8')
  const parsed = JSON.parse(raw)

  return {
    users: Array.isArray(parsed.users) ? parsed.users : [],
  }
}

async function writeLocalAccounts(accounts) {
  await ensureAccountsFile()
  writeQueue = writeQueue.then(() =>
    fs.writeFile(
      accountsFilePath,
      `${JSON.stringify({ users: Array.isArray(accounts.users) ? accounts.users : [] }, null, 2)}\n`,
      'utf8'
    )
  )

  await writeQueue
}

async function readSupabaseAccounts() {
  const supabase = getSupabaseAdmin()

  if (!supabase) {
    throw new Error('Supabase client is not configured.')
  }

  const { data, error } = await supabase.from('customers').select('*').order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Unable to load customers from Supabase. ${error.message}`)
  }

  return {
    users: (data || []).map(normalizeCustomerRow),
  }
}

async function writeSupabaseAccounts(accounts) {
  const supabase = getSupabaseAdmin()

  if (!supabase) {
    throw new Error('Supabase client is not configured.')
  }

  const rows = (Array.isArray(accounts.users) ? accounts.users : []).map(toCustomerRow)

  if (rows.length > 0) {
    const { error } = await supabase.from('customers').upsert(rows, { onConflict: 'id' })

    if (error) {
      throw new Error(`Unable to write customers to Supabase. ${error.message}`)
    }
  }
}

async function readAccounts() {
  if (isSupabaseConfigured()) {
    return readSupabaseAccounts()
  }

  return readLocalAccounts()
}

async function writeAccounts(accounts) {
  if (isSupabaseConfigured()) {
    await writeSupabaseAccounts(accounts)
    return
  }

  await writeLocalAccounts(accounts)
}

function encodeSessionToken(payload) {
  const serialized = JSON.stringify(payload)
  const body = Buffer.from(serialized, 'utf8').toString('base64url')
  const signature = crypto.createHmac('sha256', sessionSecret).update(body).digest('base64url')
  return `${body}.${signature}`
}

function decodeSessionToken(token) {
  const [body, signature] = String(token || '').split('.')

  if (!body || !signature) {
    return null
  }

  const expectedSignature = crypto.createHmac('sha256', sessionSecret).update(body).digest('base64url')

  if (signature.length !== expectedSignature.length) {
    return null
  }

  if (!crypto.timingSafeEqual(Buffer.from(signature, 'utf8'), Buffer.from(expectedSignature, 'utf8'))) {
    return null
  }

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (!payload?.userId || !payload?.expiresAt || Date.now() > Number(payload.expiresAt)) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

export async function createCustomerAccount({ name, email, phone, address, password }) {
  const accounts = await readAccounts()
  const normalizedEmail = normalizeEmail(email)

  if (accounts.users.some((user) => user.email === normalizedEmail)) {
    throw new Error('An account with this email already exists.')
  }

  const user = {
    id: crypto.randomUUID(),
    name: String(name).trim(),
    email: normalizedEmail,
    phone: String(phone).trim(),
    address: String(address).trim(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
    updatedAt: null,
  }

  accounts.users.unshift(user)
  await writeAccounts(accounts)
  return sanitizeUser(user)
}

export async function authenticateCustomer(email, password) {
  const accounts = await readAccounts()
  const normalizedEmail = normalizeEmail(email)
  const user = accounts.users.find((entry) => entry.email === normalizedEmail)

  if (!user || !verifyPassword(password, user.passwordHash)) {
    throw new Error('Invalid email or password.')
  }

  return sanitizeUser(user)
}

export async function getCustomerById(id) {
  const accounts = await readAccounts()
  const user = accounts.users.find((entry) => entry.id === id)
  return user ? sanitizeUser(user) : null
}

export async function updateCustomerProfile(userId, updates) {
  const accounts = await readAccounts()
  const user = accounts.users.find((entry) => entry.id === userId)

  if (!user) {
    throw new Error('Customer account not found.')
  }

  user.name = String(updates.name).trim()
  user.phone = String(updates.phone).trim()
  user.address = String(updates.address).trim()
  user.updatedAt = new Date().toISOString()

  await writeAccounts(accounts)
  return sanitizeUser(user)
}

export function createCustomerSession(user) {
  return encodeSessionToken({
    userId: user.id,
    createdAt: Date.now(),
    expiresAt: Date.now() + sessionTtlMs,
  })
}

export function destroyCustomerSession(token) {
  return Boolean(token)
}

export async function requireCustomer(request, response, next) {
  const token = getBearerToken(request)
  const session = decodeSessionToken(token)

  if (!token || !session) {
    return response.status(401).json({ message: 'Customer login required.' })
  }

  const customer = await getCustomerById(session.userId)

  if (!customer) {
    return response.status(401).json({ message: 'Customer session is invalid.' })
  }

  request.customerToken = token
  request.customerSession = {
    userId: customer.id,
    createdAt: new Date(session.createdAt).toISOString(),
  }
  request.customer = customer
  return next()
}
