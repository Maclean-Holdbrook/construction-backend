# Construction Website Backend

Express API prepared for Vercel deployment.

## Local Development

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in the required values.

3. Start the API:
```bash
npm run dev
```

## Vercel

Set these environment variables in Vercel:

- `PAYSTACK_SECRET_KEY`
- `FRONTEND_URL`
- `CORS_ALLOWED_ORIGINS`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_SESSION_TTL_MS`
- `CUSTOMER_SESSION_SECRET`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `CONTACT_TO_EMAIL`

Deploy this repo to Vercel as a backend project with:

- Framework Preset: `Other`
- Root Directory: empty
- Build Command: none
- Output Directory: none
- Install Command: `npm install`

The backend is served by the catch-all Vercel function at `api/[...path].js`.
