import { promises as fs } from 'node:fs'
import path from 'node:path'
import { getSupabaseAdmin, isSupabaseConfigured } from './supabase.js'

const dataFilePath = path.join(process.cwd(), 'backend', 'data', 'store.json')
const defaultStore = {
  products: [],
  orders: [],
}

let writeQueue = Promise.resolve()

async function ensureLocalStoreFile() {
  await fs.mkdir(path.dirname(dataFilePath), { recursive: true })

  try {
    await fs.access(dataFilePath)
  } catch {
    await fs.writeFile(dataFilePath, `${JSON.stringify(defaultStore, null, 2)}\n`, 'utf8')
  }
}

async function readLocalStore() {
  await ensureLocalStoreFile()
  const raw = await fs.readFile(dataFilePath, 'utf8')
  const parsed = JSON.parse(raw)

  return {
    products: Array.isArray(parsed.products) ? parsed.products : [],
    orders: Array.isArray(parsed.orders) ? parsed.orders : [],
  }
}

async function writeLocalStore(store) {
  await ensureLocalStoreFile()
  writeQueue = writeQueue.then(() =>
    fs.writeFile(
      dataFilePath,
      `${JSON.stringify(
        {
          products: Array.isArray(store.products) ? store.products : [],
          orders: Array.isArray(store.orders) ? store.orders : [],
        },
        null,
        2
      )}\n`,
      'utf8'
    )
  )

  await writeQueue
}

function normalizeProductRow(row) {
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    price: Number(row.price),
    unit: row.unit,
    badge: row.badge,
    stock: row.stock,
    description: row.description,
    imageUrl: row.image_url,
  }
}

function normalizeOrderRow(row) {
  return {
    id: row.id,
    reference: row.reference,
    customerId: row.customer_id || row.customer?.account?.userId || null,
    customer: row.customer,
    cart: Array.isArray(row.cart) ? row.cart : [],
    totals: row.totals,
    amountKobo: Number(row.amount_kobo),
    paymentStatus: row.payment_status,
    orderStatus: row.order_status,
    createdAt: row.created_at,
    paidAt: row.paid_at,
    gatewayResponse: row.gateway_response,
    retryOf: row.retry_of,
    lastCheckedAt: row.last_checked_at,
    updatedAt: row.updated_at,
  }
}

function toProductRow(product) {
  return {
    id: product.id,
    name: product.name,
    category: product.category,
    price: Number(product.price),
    unit: product.unit,
    badge: product.badge,
    stock: product.stock,
    description: product.description,
    image_url: product.imageUrl,
  }
}

function toOrderRow(order) {
  return {
    id: order.id,
    reference: order.reference,
    customer_id: order.customerId || order.customer?.account?.userId || null,
    customer: order.customer,
    cart: Array.isArray(order.cart) ? order.cart : [],
    totals: order.totals,
    amount_kobo: Number(order.amountKobo),
    payment_status: order.paymentStatus,
    order_status: order.orderStatus,
    created_at: order.createdAt,
    paid_at: order.paidAt || null,
    gateway_response: order.gatewayResponse || null,
    retry_of: order.retryOf || null,
    last_checked_at: order.lastCheckedAt || null,
    updated_at: order.updatedAt || null,
  }
}

function assertSupabaseResponse(error, message) {
  if (error) {
    throw new Error(`${message} ${error.message}`)
  }
}

async function readSupabaseStore() {
  const supabase = getSupabaseAdmin()

  if (!supabase) {
    throw new Error('Supabase client is not configured.')
  }

  const [{ data: products, error: productsError }, { data: orders, error: ordersError }] = await Promise.all([
    supabase.from('products').select('*').order('name', { ascending: true }),
    supabase.from('orders').select('*').order('created_at', { ascending: false }),
  ])

  assertSupabaseResponse(productsError, 'Unable to load products from Supabase.')
  assertSupabaseResponse(ordersError, 'Unable to load orders from Supabase.')

  return {
    products: (products || []).map(normalizeProductRow),
    orders: (orders || []).map(normalizeOrderRow),
  }
}

async function syncSupabaseTable({ table, keyField, rows, existingKeys }) {
  const supabase = getSupabaseAdmin()

  if (!supabase) {
    throw new Error('Supabase client is not configured.')
  }

  if (rows.length > 0) {
    const { error } = await supabase.from(table).upsert(rows, { onConflict: keyField })
    assertSupabaseResponse(error, `Unable to write ${table} rows to Supabase.`)
  }

  const nextKeys = new Set(rows.map((row) => row[keyField]))
  const keysToDelete = existingKeys.filter((key) => !nextKeys.has(key))

  if (keysToDelete.length > 0) {
    const { error } = await supabase.from(table).delete().in(keyField, keysToDelete)
    assertSupabaseResponse(error, `Unable to delete removed ${table} rows from Supabase.`)
  }
}

async function writeSupabaseStore(store) {
  const currentStore = await readSupabaseStore()

  await syncSupabaseTable({
    table: 'products',
    keyField: 'id',
    rows: (Array.isArray(store.products) ? store.products : []).map(toProductRow),
    existingKeys: currentStore.products.map((product) => product.id),
  })

  await syncSupabaseTable({
    table: 'orders',
    keyField: 'id',
    rows: (Array.isArray(store.orders) ? store.orders : []).map(toOrderRow),
    existingKeys: currentStore.orders.map((order) => order.id),
  })
}

export async function readStore() {
  if (isSupabaseConfigured()) {
    return readSupabaseStore()
  }

  return readLocalStore()
}

export async function writeStore(store) {
  if (isSupabaseConfigured()) {
    await writeSupabaseStore(store)
    return
  }

  await writeLocalStore(store)
}
