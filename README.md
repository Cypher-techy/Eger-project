# Relief Hub: M-Pesa STK Push

Run `npm install`, copy `.env.example` to `.env`, fill in the Daraja and Supabase credentials, and run `npm start`. Set `DARAJA_ENVIRONMENT` to `sandbox` or `production` and use matching credentials, shortcode and passkey. Apply `supabase/schema.sql` in Supabase. Keep the service role key on the server only.

`MPESA_CALLBACK_URL` must be a publicly accessible HTTPS URL pointing to `/api/callback`; localhost cannot receive Safaricom callbacks. Configure a deployed server or a secure tunnel for local testing.

POST JSON `{ "phone": "0712345678" }` to `/api/stkpush`. Kenyan numbers in `07...`, `01...`, `254...` or `+254...` format are accepted. The amount is fixed at KES 50. A successful response contains `checkoutRequestId` and means the prompt was accepted, **not** that payment succeeded. The eventual callback is stored in `mpesa_stk_callbacks`, including failures; `result_code = 0` indicates success. Callbacks are upserted by checkout request ID. Missing database configuration or a write failure returns an error instead of silently losing the result.

Callbacks are publicly reachable and are not authenticated by this implementation. Do not use a callback alone as proof of payment or grant access based on it; verify the transaction independently with Safaricom before fulfilling an order. Protect and monitor the endpoint at the deployment layer.

Run `npm test` for automated tests. The repository does not currently include a runnable frontend (`public/`) or an `/api/apply` endpoint.
