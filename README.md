# KaziLeo and existing M-Pesa integration

The home page links to the KaziLeo account platform. Activities, account access, admin review and manual withdrawals require Supabase configuration and staging validation as described below. The grant entry page at `/grant.html` directs applicants to the authenticated account form; the original application and STK API routes remain available and unchanged.

Run `npm install`, copy `.env.example` to `.env`, fill in the Daraja and Supabase credentials, and run `npm start`. Set `MPESA_ENVIRONMENT` to `sandbox` or `production` and use matching `MPESA_CONSUMER_KEY`, `MPESA_CONSUMER_SECRET`, `MPESA_SHORTCODE` and `MPESA_PASSKEY`. Set `MPESA_ENABLED=false` to disable STK requests (`true` by default). Set `MPESA_TRANSACTION_TYPE` to `CustomerPayBillOnline` (default) or `CustomerBuyGoodsOnline`. For Buy Goods, set `MPESA_PARTY_B` to the till/Party B registered with Safaricom; for PayBill it defaults to the shortcode. Verify the correct shortcode, Party B and passkey for your Daraja registration with Safaricom. The legacy `DARAJA_ENVIRONMENT`, `DARAJA_CONSUMER_KEY`, `DARAJA_CONSUMER_SECRET`, `DARAJA_SHORTCODE` and `DARAJA_PASSKEY` remain supported when their corresponding `MPESA_*` variables are absent; `MPESA_*` takes precedence. Apply `supabase/schema.sql` in Supabase. Keep the service role key on the server only.

`MPESA_CALLBACK_URL` must be a publicly accessible HTTPS URL pointing to `/api/callback`; localhost cannot receive Safaricom callbacks. Configure a deployed server or a secure tunnel for local testing.

POST JSON `{ "phone": "0712345678" }` to `/api/stkpush`. Kenyan numbers in `07...`, `01...`, `254...` or `+254...` format are accepted. The amount is fixed at KES 50. A successful response contains `checkoutRequestId` and means the prompt was accepted, **not** that payment succeeded. The eventual callback is stored in `mpesa_stk_callbacks`, including failures; `result_code = 0` indicates success. Callbacks are upserted by checkout request ID. Missing database configuration or a write failure returns an error instead of silently losing the result.

Callbacks are publicly reachable and are not authenticated by this implementation. Do not use a callback alone as proof of payment or grant access based on it; verify the transaction independently with Safaricom before fulfilling an order. Protect and monitor the endpoint at the deployment layer.

The legacy `/api/apply` endpoint stores applications for review, but the current grant page instead uses the account-linked grant workflow below. Neither form verifies a phone number or sends an STK prompt automatically. Deploy the Node server (or configure equivalent serverless routing); a static-only deployment cannot serve its API endpoints.

Run `npm test` for automated tests.

## KaziLeo accounts and manual withdrawals

The separate `/platform.html` page implements Supabase email/password signup and sign-in, activity submissions, admin review, KES 100 credits, withdrawal requests (minimum KES 1,200), and manual payout tracking. The home page category links open the account platform; available activities are loaded from Supabase. There are no automatic B2C payouts, welcome bonuses, or referral rewards. Level-two unlocks and withdrawal fees require separate payments and manual verification as described below. The existing STK Push integration is unchanged and is not connected to this platform.

To configure it:

1. In a Supabase project, apply `supabase/kazileo-ledger.sql` **once** in the SQL editor. This migration has not yet been exercised against a live Supabase database; test it in a staging project first.
If the earlier version of `kazileo-ledger.sql` was already applied with the KES 2,800 minimum, run `supabase/migrations/20261030_withdrawal_minimum_1200.sql` once against that database; changing the frontend alone does not update the database. New installations should use the updated base schema instead.

2. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` to the project's URL and public anon/publishable key on the server (including Vercel Production); redeploy. Never put a service-role or secret key in `SUPABASE_ANON_KEY`. Existing STK callback persistence still needs its separate `SUPABASE_SERVICE_ROLE_KEY`.
3. Configure Supabase email authentication, confirmation and allowed redirect URLs. Create an admin account, then provision that account's Auth user UUID by inserting it into `public.kazileo_admins` through the trusted SQL editor. Never expose admin provisioning to public users.
4. Add real, accurate activities through the trusted SQL editor to `public.kazileo_activities` (title, instructions, active); initially none exist. The SQL migration contains no sample paid tasks.
5. Test signup, email confirmation, permissions, review, concurrent requests and manual payout reconciliation in staging before handling money. Obtain independent security and financial/legal review; configure abuse prevention, privacy policies, backups, monitoring and support procedures.

The intended workflow is: a user submits an active activity; an admin approves or rejects it; the user requests a withdrawal with a Kenyan phone number; the admin claims a pending withdrawal before sending money externally, then records the verified receipt. Only an unclaimed pending request may be rejected and refunded. Reconcile an uncertain payment with Safaricom before marking it paid; do not resend or refund on a guess. Claimed payouts cannot currently be reversed in the UI and require a controlled, audited reconciliation procedure. Sessions are stored in browser sessionStorage and require signing in again after expiry.

## Global level-two unlock (KES 20)

Run `supabase/migrations/20261030_level_two_unlock.sql` **after** `supabase/kazileo-ledger.sql` in a staging Supabase project. It adds level-one/two activities, restricts level-two content and submissions to approved unlocks, and stores payment requests. To create real level-two activities, insert rows into `kazileo_activities` with `level = 2` and `active = true` through the trusted SQL editor. Existing activities default to level one. Apply the migration to production only after database, permission and payment tests pass.

The signed-in user explicitly requests a KES 20 STK push from the account page. A single approved payment unlocks level two across all activities. The endpoint uses the existing `MPESA_*`/legacy `DARAJA_*` credentials and callback URL, plus server-only `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`. The original `/api/stkpush` still requests KES 50 and is unchanged. An accepted prompt is **not** a successful payment. The administrator must independently verify the phone, KES 20 amount, checkout ID and receipt with Safaricom before approving in the admin review section; an unauthenticated callback is not sufficient proof. A timeout, an interrupted request, or a failed database write may leave the payment in `initiating`: do not prompt the user to pay again until the operator has reconciled it with Safaricom. Requests without a stored checkout ID require controlled operational reconciliation; they cannot be approved in the UI. Mark unsuccessful only after verifying no payment was made. This workflow does not initiate withdrawals or B2C payouts.

The new migration and real Safaricom/Supabase interaction have not been validated against a live project. Test end-to-end in sandbox, including duplicate requests, failures, callback delays, unauthorized access and database concurrency, and obtain a security review before accepting real money.

## Separate KES 50 withdrawal fee

In a staging project, apply `supabase/migrations/20261031_withdrawal_fee.sql` after `kazileo-ledger.sql` and, for older installs, `20261030_withdrawal_minimum_1200.sql`. The level-two migration is also needed by the current account page. **Do not run the older withdrawal-minimum migration after the fee migration**; its guard intentionally aborts rather than overwriting fee enforcement.

The account page clearly discloses a separate KES 50 payment before each withdrawal request. It is a payment, not verification of phone ownership, and does not guarantee withdrawal approval. The user chooses an amount and phone; the server checks the currently available balance before requesting an STK prompt. The fee is tied to that user, amount and phone, and prevents duplicate pending requests. After independently verifying the payment with Safaricom, an admin marks it verified; only then can the user submit the withdrawal. The fee is consumed atomically with the balance hold and withdrawal record. The payout is still reviewed and sent manually; a confirmed fee is not a payout.

Balance is not held while the fee is pending, and the user may no longer have sufficient balance when submitting a request. Provide a documented fee refund and dispute procedure before use. If an STK request times out or the checkout ID is not saved, reconcile with Safaricom before retrying or marking it unsuccessful; the UI cannot approve a fee without a checkout ID. A public callback alone is not proof of payment. No refund of the KES 50 fee is automated, including after a rejected withdrawal.

Neither the migration nor the live payment flow has been tested against a real Supabase project or Safaricom. Before handling money, validate the transaction and concurrency rules in staging and obtain security, legal and consumer-protection review.

## Other applications in this repository

The root URL serves KaziLeo. The previous KaziMtaaniJobs landing page from main is preserved at `/kazimtaani.html`, and the separate Next.js/Supabase prototype is in `kazi-connect/` with its own setup and migrations. These are independent prototypes, not an official Government of Kenya KaziMtaani programme. The root `ADMIN_EMAIL` setting alone does not provision an administrator; KaziLeo admin access is configured in its Supabase admin table as described above. Do not store admin passwords in source control.

## Admin-approved grants

After the existing KaziLeo ledger, minimum, level-two and withdrawal-fee migrations, apply `supabase/migrations/20261101_approved_grants.sql` in staging. `/grant.html` directs applicants to the authenticated account form. A form submission does not create a grant or trigger a payment: an admin must review the pending application, verify that the grant is genuine and funded, and record an approved whole-shilling amount. Approval credits the user's wallet exactly once. The applicant can submit the form again with the same registration number and phone to check the account-linked award; if the award remains available, the page pre-fills the separately disclosed KES 50 withdrawal-fee flow, which still requires the applicant's explicit consent and independent admin payment verification. A withdrawal marks an outstanding award unavailable for checking; rejecting and refunding that withdrawal makes it eligible for checking again. Current accounting treats any withdrawal as using the oldest outstanding grant and allows one active grant application per account.

The migration changes ledger constraints and withdrawal functions and has **not been tested against a live database**. Back up data and test migration order, permissions, concurrent approvals/withdrawals, payment verification, refunds, and reconciliation in staging. An approval entry is only an administrator attestation; it is not proof of external funding. Existing users with an unresolved fee tied to different details must contact support rather than pay again.
