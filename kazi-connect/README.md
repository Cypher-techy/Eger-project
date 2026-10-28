# KaziConnect Kenya

A Next.js + Supabase starter for a Kenyan online-opportunities platform. The landing page is a design prototype; sample tasks are clearly labelled as examples and must be replaced with reviewed, real opportunities before launch.

## Run locally

```bash
cd kazi-connect
npm install
cp .env.example .env.local
npm run dev
```

Configure Supabase project URL and anon key in `.env.local`. Apply `supabase/schema.sql` in the Supabase SQL Editor before enabling account, wallet or payment routes.

## Important payment and wallet rules

- Do not represent promotional credit as cash until funds have been set aside for the offer.
- A successful STK prompt response means only that Safaricom accepted the request. Confirm payment server-side before marking a phone as verified.
- Treat callbacks as untrusted input; reconcile payment details with Safaricom's STK Query API and make crediting idempotent.
- Never expose `SUPABASE_SERVICE_ROLE_KEY`, Daraja secrets, or B2C security credentials to the browser.
- Real withdrawals require Safaricom B2C access, production credentials, sufficient prefunded balance, admin authorization, duplicate-request protection, and result/timeout callback handling.
- Do not launch with production payments until callback reconciliation, rate limiting, audit logging, and withdrawal tests are complete.

## Current status

This branch contains the new Next.js landing page, styles, environment template, and database schema. It does not claim that live STK Push, phone verification, wallet crediting, or withdrawals are operational until the server routes are implemented, credentials are configured, and the end-to-end flow is tested in Daraja sandbox and then production.
