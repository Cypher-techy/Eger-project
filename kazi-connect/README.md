# KaziMtaaniJobs

A mobile-first Next.js + Supabase opportunities platform with a gold, white and charcoal design. This is an independent platform and is not an official Government of Kenya programme. Replace sample opportunities with real, reviewed listings before launch.

## Run locally

```bash
cd kazi-connect
npm install
cp .env.example .env.local
npm run dev
```

Configure Supabase URL, anon key and the server-only service-role key in `.env.local`. For a new Supabase project, run `supabase/schema.sql`. For an existing project that already has the original schema, run `supabase/migrations/20261028_kazimtaani_bonus_withdrawals.sql` in the Supabase SQL Editor. Keep the service-role key and Daraja credentials server-side.

## Phone verification and KES 750 welcome bonus

- `POST /api/verify` initiates the KSh 70 Daraja STK Push using `CustomerBuyGoodsOnline`; configure `MPESA_PARTY_B` with your approved Buy Goods till.
- `POST /api/callback` finds the matching payment and independently queries Safaricom before accepting a successful payment.
- The callback validates ResultCode, the KSh 70 amount, payer phone and receipt before calling the atomic `confirm_phone_verification` SQL function.
- The SQL function marks the account phone-verified and credits the KES 750 welcome bonus once, using a unique ledger reference. The credit is withdrawable only when `platform_settings.welcome_promotion` has `funded=true` and `enabled=true`.
- The schema/migration currently sets the promotion as funded because the project owner confirmed that payout funds are reserved. Keep `funded=true` only while at least KES 750 per eligible new user is actually reserved. If that reserve is not available, set it to false before accepting payments.
- An accepted STK request is not proof of payment. The dashboard polls `GET /api/verification-status` and refreshes only after server-side verification is confirmed.

## Withdrawals

- The dashboard shows the available withdrawable ledger balance and a **Withdraw to M-Pesa** request form.
- `POST /api/withdraw` requires an authenticated account, verified phone and sufficient available balance. The database function serializes withdrawal requests per user and prevents simultaneous requests from exceeding the ledger balance.
- Withdrawal requests are **not live M-Pesa payouts yet**. They remain pending admin review. Actual payout requires Safaricom B2C credentials, an adequately funded business account, admin authorization, idempotency, and B2C result/timeout callback handling. The interface never claims a request is a completed payout.

## Security and launch checklist

- Keep Supabase service-role and Daraja credentials in server-only environment variables.
- Test the complete flow in Safaricom sandbox before production use.
- The promotion should be funded and its terms visible before a user pays.
- Replace illustrative task cards with genuine opportunities and verified reward terms.
- Do not claim government affiliation without authorization or promise earnings from sample listings.
