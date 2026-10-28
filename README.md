# KaziMtaaniJobs

An independent Kenyan opportunities-board prototype with an M-Pesa STK Push verification flow. This project is **not an official Government of Kenya KaziMtaani programme**. Replace example listings with real, verified opportunities before launch.

## Run locally

```bash
npm install
cp .env.example .env
npm start
```

Configure the Daraja variables and a public HTTPS `MPESA_CALLBACK_URL` ending in `/api/callback`. Set `MPESA_ENVIRONMENT=sandbox` while testing. Keep credentials and `SUPABASE_SERVICE_ROLE_KEY` server-side. Set `MPESA_ENABLED=false` to disable payment requests.

## Phone verification payment

- The current root `POST /api/stkpush` endpoint uses the existing Daraja flow and charges **KSh 50**.
- The page clearly discloses the fee and asks the visitor to consent before sending the STK Push.
- After Safaricom accepts an STK request, the page displays **PAYMENT PENDING**. This is not proof that money was received, and it does not verify the phone number or guarantee employment.
- `POST /api/callback` stores the callback in `mpesa_stk_callbacks`. A successful callback has `result_code = 0`; failed or unconfirmed payments must not be represented as paid.
- Confirm the callback schema exists in Supabase and test the full flow in Safaricom sandbox before using production credentials.

## Admin account

The intended administrator email is `admin@kazimtaani.ac.ke`, configured as `ADMIN_EMAIL`. The existing root Express app does **not yet implement a protected admin sign-in/dashboard**. Create the account through the configured identity provider and implement server-side role checks before granting admin access. Do not put a password in source code or commit it to GitHub. Set a unique password through the identity provider's secure account setup/reset flow.

## Before launch

- The opportunity cards on the landing page are explicitly examples, not live vacancies. Publish only genuine listings with verifiable employers, duties, pay, deadlines and contact details.
- This platform must not be presented as a government programme or use affiliation claims without authorization.
- A phone-verification fee does not guarantee a job, selection, grant or earnings.
- The root endpoint records callbacks, but a full authenticated payment-status reconciliation flow and phone-verification linkage are not implemented yet. Do not mark a user as verified based solely on the STK prompt response.
- The separate `kazi-connect/` Next.js/Supabase prototype remains in this repository branch for further development; the root Express app is the entry point used by `npm start`.

