# KaziConnect Kenya

A Next.js + Supabase starter for a Kenyan online-opportunities platform. The landing page is a design prototype; sample tasks are clearly labelled as examples and must be replaced with reviewed, real opportunities before launch.

## Run locally

```bash
cd kazi-connect
npm install
cp .env.example .env.local
npm run dev
```

Configure Supabase URL, anon key and the server-only service-role key in `.env.local`. Apply `supabase/schema.sql` in the Supabase SQL Editor before enabling account, wallet or payment routes. Use a fresh Supabase project or review existing objects before applying the schema.

## Daraja STK Push

KaziConnect reuses the same Daraja request flow, environment-variable conventions, phone normalization and public endpoint paths from the working parent-repository endpoints `api/stkpush.js` and `api/callback.js`:

- `POST /api/stkpush` — requires an authenticated account, a valid Kenyan number and explicit consent to the KSh 70 fee.
- `POST /api/callback` — keeps the callback path compatible with the existing endpoint configuration and looks up the stored payment by its CheckoutRequestID.
- Set `MPESA_CALLBACK_URL=https://YOUR_DEPLOYED_DOMAIN/api/callback`. The callback must be public HTTPS; localhost cannot receive Safaricom callbacks.
- `MPESA_*` names take precedence; legacy `DARAJA_*` credentials remain supported as fallbacks, matching the original endpoint.
- The new flow charges KSh 70, not the original Relief Hub endpoint's KSh 50.
- The callback does not trust the callback body alone. It calls Safaricom STK Query, checks the amount, payer phone and receipt, then calls the atomic `confirm_phone_verification` database function. Phone verification is not marked successful when confirmation is uncertain.
- The service-role key and Daraja credentials must remain server-side.

## Important payment and wallet rules

- A successful STK prompt response means only that Safaricom accepted the request. It is not proof that payment succeeded.
- The KSh 750 welcome offer remains non-withdrawable unless it is funded and enabled through a properly audited process. Do not describe it as guaranteed cash if it is not funded.
- Do not award earnings for placeholder tasks. Publish only real, reviewed opportunities with accurate reward terms.
- The current changes implement phone verification collection, but have not been run through a full Daraja sandbox callback test from this environment. Verify the complete flow in sandbox before using production credentials.
- Real withdrawals still require Safaricom B2C access, production credentials, sufficient prefunded balance, admin authorization, duplicate-request protection, and result/timeout callback handling. Withdrawal processing is not implemented as live B2C yet.

## Current status

This branch contains the new Next.js landing page, Supabase account registration/sign-in, account dashboard, wallet/opportunity schema, and the STK Push phone-verification routes. The code has been committed to the feature branch and is not merged into `main`. A local production build and end-to-end payment test have not been run here.