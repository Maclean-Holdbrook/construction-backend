import { existsSync } from 'node:fs'
import path from 'node:path'
import express from 'express'
import { createApp } from './app.js'
import { isSupabaseConfigured } from './lib/supabase.js'

const app = createApp()
const port = Number(process.env.PORT || 3000)
const distPath = path.join(process.cwd(), 'dist')
const indexPath = path.join(distPath, 'index.html')

if (existsSync(distPath) && existsSync(indexPath)) {
  app.use(express.static(distPath))

  app.get(/.*/, (_request, response) => {
    response.sendFile(indexPath)
  })
}

app.listen(port, () => {
  const storeMode = isSupabaseConfigured() ? 'supabase' : 'local-json'
  console.log(`Paystack API server listening on http://127.0.0.1:${port} using ${storeMode} storage`)
})
