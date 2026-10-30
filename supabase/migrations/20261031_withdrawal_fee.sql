-- Apply after kazileo-ledger.sql and the withdrawal-minimum migration.
-- The KES 50 charge is a payment, not proof of phone ownership.
BEGIN;
CREATE TABLE public.kazileo_withdrawal_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  phone text NOT NULL CHECK (phone ~ '^254[17][0-9]{8}$'),
  withdrawal_amount_kes bigint NOT NULL CHECK (withdrawal_amount_kes >= 1200),
  amount_kes integer NOT NULL DEFAULT 50 CHECK (amount_kes = 50),
  status text NOT NULL DEFAULT 'initiating' CHECK (status IN ('initiating','pending','verified','consumed','failed')),
  checkout_request_id text UNIQUE,
  merchant_request_id text,
  verified_receipt text,
  withdrawal_id uuid UNIQUE REFERENCES public.kazileo_withdrawals(id),
  reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status NOT IN ('verified','consumed') OR (checkout_request_id IS NOT NULL AND verified_receipt IS NOT NULL AND length(trim(verified_receipt)) > 0)),
  CHECK (status <> 'consumed' OR withdrawal_id IS NOT NULL)
);
CREATE UNIQUE INDEX kazileo_one_open_withdrawal_fee ON public.kazileo_withdrawal_fees(user_id) WHERE status IN ('initiating','pending','verified');
CREATE UNIQUE INDEX kazileo_unique_withdrawal_fee_receipt ON public.kazileo_withdrawal_fees(upper(trim(verified_receipt))) WHERE verified_receipt IS NOT NULL;
ALTER TABLE public.kazileo_withdrawal_fees ENABLE ROW LEVEL SECURITY;
CREATE POLICY kazileo_withdrawal_fees_read ON public.kazileo_withdrawal_fees FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.kazileo_is_admin());
GRANT SELECT ON public.kazileo_withdrawal_fees TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.kazileo_withdrawal_fees FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.kazileo_review_withdrawal_fee(p_id uuid, p_approve boolean, p_receipt text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE payment public.kazileo_withdrawal_fees%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kazileo_is_admin() THEN RAISE EXCEPTION 'Admin required'; END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION 'Decision required'; END IF;
  SELECT * INTO payment FROM public.kazileo_withdrawal_fees WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR payment.status NOT IN ('initiating','pending') THEN RAISE EXCEPTION 'Payment is not awaiting review'; END IF;
  IF p_approve AND (payment.checkout_request_id IS NULL OR p_receipt IS NULL OR length(trim(p_receipt)) NOT BETWEEN 1 AND 100) THEN RAISE EXCEPTION 'Checkout ID and independently verified receipt required'; END IF;
  UPDATE public.kazileo_withdrawal_fees SET status = CASE WHEN p_approve THEN 'verified' ELSE 'failed' END,
    verified_receipt = CASE WHEN p_approve THEN trim(p_receipt) ELSE NULL END, reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION public.kazileo_review_withdrawal_fee(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kazileo_review_withdrawal_fee(uuid,boolean,text) TO authenticated;

-- The fee is tied to one user, one number and one withdrawal amount. Lock and
-- consume it atomically with the balance hold and request; errors roll back all.
CREATE OR REPLACE FUNCTION public.kazileo_request_withdrawal(p_amount bigint, p_phone text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid; actor uuid := auth.uid(); fee_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_amount IS NULL OR p_amount < 1200 OR p_phone IS NULL OR p_phone !~ '^254[17][0-9]{8}$' THEN RAISE EXCEPTION 'Invalid amount or Kenyan phone number'; END IF;
  SELECT id INTO fee_id FROM public.kazileo_withdrawal_fees
    WHERE user_id = actor AND status = 'verified' AND phone = p_phone AND withdrawal_amount_kes = p_amount FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A verified KES 50 fee for this amount and number is required'; END IF;
  UPDATE public.kazileo_wallets SET available_kes = available_kes - p_amount WHERE user_id = actor AND available_kes >= p_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient available balance'; END IF;
  INSERT INTO public.kazileo_withdrawals(user_id, amount_kes, phone) VALUES (actor, p_amount, p_phone) RETURNING id INTO result;
  INSERT INTO public.kazileo_ledger(user_id, amount_kes, kind, withdrawal_id) VALUES (actor, -p_amount, 'withdrawal_hold', result);
  UPDATE public.kazileo_withdrawal_fees SET status = 'consumed', withdrawal_id = result WHERE id = fee_id;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.kazileo_request_withdrawal(bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kazileo_request_withdrawal(bigint,text) TO authenticated;
COMMIT;
