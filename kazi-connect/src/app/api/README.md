# Existing Daraja endpoint compatibility

KaziConnect uses the same public endpoint paths as the existing working Relief Hub implementation in the parent repository:

- `POST /api/stkpush` — reuses the `MPESA_*` environment names, legacy `DARAJA_*` fallbacks, Kenyan phone normalization, Nairobi timestamp, Daraja OAuth and STK Push process-request flow from `api/stkpush.js`.
- `POST /api/callback` — preserves the existing callback URL path from `api/callback.js`, but maps callbacks to a KaziConnect payment record and calls Safaricom STK Query before marking verification confirmed.

Changes required for KaziConnect: the amount is KSh 70 rather than the old project's KSh 50; requests are authenticated to the logged-in Supabase user; each request is stored before sending the prompt; the callback must match that checkout ID, expected amount, phone number, receipt, and a successful Safaricom query before it verifies the profile.

Use `MPESA_CALLBACK_URL=https://YOUR_DEPLOYED_DOMAIN/api/callback`. Keep credentials server-side. The original Relief Hub endpoints on the parent branch are unchanged.
