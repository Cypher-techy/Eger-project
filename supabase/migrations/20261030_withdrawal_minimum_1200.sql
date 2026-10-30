-- Apply only AFTER kazileo-ledger.sql, to update an existing installation.
-- Update both the database constraint and the RPC in the same transaction.
BEGIN;
-- Do not overwrite the fee-aware RPC if this older migration is rerun later.
DO $$ BEGIN
  IF to_regclass('public.kazileo_withdrawal_fees') IS NOT NULL THEN
    RAISE EXCEPTION 'Apply withdrawal minimum migration before the withdrawal fee migration';
  END IF;
END $$;
ALTER TABLE public.kazileo_withdrawals
  DROP CONSTRAINT IF EXISTS kazileo_withdrawals_amount_kes_check;
ALTER TABLE public.kazileo_withdrawals
  ADD CONSTRAINT kazileo_withdrawals_amount_kes_check CHECK (amount_kes >= 1200);

CREATE OR REPLACE FUNCTION public.kazileo_request_withdrawal(p_amount bigint, p_phone text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid; actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_amount IS NULL OR p_amount < 1200 OR p_phone IS NULL OR p_phone !~ '^254[17][0-9]{8}$' THEN
    RAISE EXCEPTION 'Invalid amount or Kenyan phone number';
  END IF;
  UPDATE public.kazileo_wallets SET available_kes = available_kes - p_amount
    WHERE user_id = actor AND available_kes >= p_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient available balance'; END IF;
  INSERT INTO public.kazileo_withdrawals(user_id, amount_kes, phone)
    VALUES (actor, p_amount, p_phone) RETURNING id INTO result;
  INSERT INTO public.kazileo_ledger(user_id, amount_kes, kind, withdrawal_id)
    VALUES (actor, -p_amount, 'withdrawal_hold', result);
  RETURN result;
END $$;
-- Restore the original restricted grants even if database defaults differ.
REVOKE ALL ON FUNCTION public.kazileo_request_withdrawal(bigint,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kazileo_request_withdrawal(bigint,text) TO authenticated;
COMMIT;
