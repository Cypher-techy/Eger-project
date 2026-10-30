-- Apply after kazileo-ledger.sql and the existing level/withdrawal migrations.
-- Grants are assigned only by a trusted, authenticated admin, not inferred from form data.
BEGIN;
CREATE TABLE public.kazileo_grant_applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  full_name text NOT NULL CHECK (length(trim(full_name)) BETWEEN 1 AND 200),
  reg_number text NOT NULL CHECK (length(trim(reg_number)) BETWEEN 1 AND 100),
  phone text NOT NULL CHECK (phone ~ '^254[17][0-9]{8}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX kazileo_one_active_grant_application ON public.kazileo_grant_applications(user_id) WHERE status IN ('pending','approved');
CREATE TABLE public.kazileo_grant_awards (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id uuid NOT NULL UNIQUE REFERENCES public.kazileo_grant_applications(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  amount_kes bigint NOT NULL CHECK (amount_kes >= 1200),
  approved_by uuid NOT NULL REFERENCES auth.users(id),
  withdrawal_id uuid UNIQUE REFERENCES public.kazileo_withdrawals(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.kazileo_grant_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kazileo_grant_awards ENABLE ROW LEVEL SECURITY;
CREATE POLICY kazileo_grant_applications_read ON public.kazileo_grant_applications FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.kazileo_is_admin());
CREATE POLICY kazileo_grant_awards_read ON public.kazileo_grant_awards FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.kazileo_is_admin());
GRANT SELECT ON public.kazileo_grant_applications, public.kazileo_grant_awards TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.kazileo_grant_applications, public.kazileo_grant_awards FROM PUBLIC, anon, authenticated;

ALTER TABLE public.kazileo_ledger ADD COLUMN grant_award_id uuid REFERENCES public.kazileo_grant_awards(id);
ALTER TABLE public.kazileo_ledger DROP CONSTRAINT kazileo_ledger_kind_check;
ALTER TABLE public.kazileo_ledger DROP CONSTRAINT kazileo_ledger_check;
ALTER TABLE public.kazileo_ledger ADD CONSTRAINT kazileo_ledger_kind_check CHECK (kind IN ('activity_reward','withdrawal_hold','withdrawal_refund','grant_award'));
ALTER TABLE public.kazileo_ledger ADD CONSTRAINT kazileo_ledger_check CHECK (
  (kind = 'activity_reward' AND amount_kes = 100 AND submission_id IS NOT NULL AND withdrawal_id IS NULL AND grant_award_id IS NULL)
  OR (kind = 'withdrawal_hold' AND amount_kes < 0 AND withdrawal_id IS NOT NULL AND submission_id IS NULL AND grant_award_id IS NULL)
  OR (kind = 'withdrawal_refund' AND amount_kes > 0 AND withdrawal_id IS NOT NULL AND submission_id IS NULL AND grant_award_id IS NULL)
  OR (kind = 'grant_award' AND amount_kes >= 1200 AND grant_award_id IS NOT NULL AND submission_id IS NULL AND withdrawal_id IS NULL)
);
CREATE UNIQUE INDEX kazileo_one_ledger_entry_per_grant ON public.kazileo_ledger(grant_award_id) WHERE kind = 'grant_award';

-- A form submission never grants money or approves itself.
CREATE FUNCTION public.kazileo_submit_grant_application(p_full_name text, p_reg_number text, p_phone text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); application_id uuid; award public.kazileo_grant_awards%ROWTYPE;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_full_name IS NULL OR length(trim(p_full_name)) NOT BETWEEN 1 AND 200 OR p_reg_number IS NULL OR length(trim(p_reg_number)) NOT BETWEEN 1 AND 100 OR p_phone IS NULL OR p_phone !~ '^254[17][0-9]{8}$' THEN RAISE EXCEPTION 'Enter valid application details'; END IF;
  SELECT id INTO application_id FROM public.kazileo_grant_applications WHERE user_id = actor AND status IN ('pending','approved');
  IF application_id IS NULL THEN
    INSERT INTO public.kazileo_grant_applications(user_id, full_name, reg_number, phone) VALUES (actor, trim(p_full_name), trim(p_reg_number), p_phone) RETURNING id INTO application_id;
  ELSIF NOT EXISTS (SELECT 1 FROM public.kazileo_grant_applications WHERE id = application_id AND phone = p_phone AND lower(trim(reg_number)) = lower(trim(p_reg_number))) THEN
    RAISE EXCEPTION 'Application details do not match the existing record. Contact support.';
  END IF;
  SELECT a.* INTO award FROM public.kazileo_grant_awards a JOIN public.kazileo_wallets w ON w.user_id = a.user_id
    WHERE a.user_id = actor AND a.application_id = application_id AND a.withdrawal_id IS NULL AND w.available_kes >= a.amount_kes ORDER BY a.created_at DESC LIMIT 1;
  IF FOUND THEN RETURN jsonb_build_object('status','approved','application_id',application_id,'amount_kes',award.amount_kes); END IF;
  RETURN jsonb_build_object('status','pending','application_id',application_id);
END $$;

-- Admin attests that the award is genuine and funded, then credits the ledger exactly once.
CREATE FUNCTION public.kazileo_review_grant_application(p_id uuid, p_approve boolean, p_amount bigint DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor uuid := auth.uid(); application public.kazileo_grant_applications%ROWTYPE; award_id uuid;
BEGIN
  IF actor IS NULL OR NOT public.kazileo_is_admin() THEN RAISE EXCEPTION 'Admin required'; END IF;
  IF p_approve IS NULL OR (p_approve AND (p_amount IS NULL OR p_amount < 1200 OR p_amount > 10000000)) THEN RAISE EXCEPTION 'Valid decision and approved grant amount required'; END IF;
  SELECT * INTO application FROM public.kazileo_grant_applications WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR application.status <> 'pending' THEN RAISE EXCEPTION 'Application is not pending'; END IF;
  UPDATE public.kazileo_grant_applications SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, reviewed_by = actor, reviewed_at = now() WHERE id = p_id;
  IF p_approve THEN
    INSERT INTO public.kazileo_grant_awards(application_id,user_id,amount_kes,approved_by) VALUES (p_id,application.user_id,p_amount,actor) RETURNING id INTO award_id;
    INSERT INTO public.kazileo_wallets(user_id,available_kes) VALUES (application.user_id,0) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.kazileo_wallets SET available_kes = available_kes + p_amount WHERE user_id = application.user_id;
    INSERT INTO public.kazileo_ledger(user_id,amount_kes,kind,grant_award_id) VALUES (application.user_id,p_amount,'grant_award',award_id);
  END IF;
END $$;
-- A withdrawal temporarily closes the grant eligibility check so an old award
-- cannot be reused as an "available grant" after money has left the balance.
-- On rejection/refund the associated grant becomes eligible for checking again.
CREATE OR REPLACE FUNCTION public.kazileo_request_withdrawal(p_amount bigint, p_phone text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid; actor uuid := auth.uid(); fee_id uuid;
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_amount IS NULL OR p_amount < 1200 OR p_phone IS NULL OR p_phone !~ '^254[17][0-9]{8}$' THEN RAISE EXCEPTION 'Invalid amount or Kenyan phone number'; END IF;
  SELECT id INTO fee_id FROM public.kazileo_withdrawal_fees WHERE user_id = actor AND status = 'verified' AND phone = p_phone AND withdrawal_amount_kes = p_amount FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'A verified KES 50 fee for this amount and number is required'; END IF;
  UPDATE public.kazileo_wallets SET available_kes = available_kes - p_amount WHERE user_id = actor AND available_kes >= p_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient available balance'; END IF;
  INSERT INTO public.kazileo_withdrawals(user_id,amount_kes,phone) VALUES (actor,p_amount,p_phone) RETURNING id INTO result;
  INSERT INTO public.kazileo_ledger(user_id,amount_kes,kind,withdrawal_id) VALUES (actor,-p_amount,'withdrawal_hold',result);
  UPDATE public.kazileo_withdrawal_fees SET status = 'consumed', withdrawal_id = result WHERE id = fee_id;
  UPDATE public.kazileo_grant_awards SET withdrawal_id = result WHERE id = (
    SELECT id FROM public.kazileo_grant_awards WHERE user_id = actor AND withdrawal_id IS NULL ORDER BY created_at ASC LIMIT 1 FOR UPDATE
  );
  RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.kazileo_reject_withdrawal(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE withdrawal public.kazileo_withdrawals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kazileo_is_admin() THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT * INTO withdrawal FROM public.kazileo_withdrawals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR withdrawal.status <> 'pending' THEN RAISE EXCEPTION 'Only pending withdrawals can be rejected'; END IF;
  UPDATE public.kazileo_withdrawals SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id;
  UPDATE public.kazileo_wallets SET available_kes = available_kes + withdrawal.amount_kes WHERE user_id = withdrawal.user_id;
  INSERT INTO public.kazileo_ledger(user_id,amount_kes,kind,withdrawal_id) VALUES (withdrawal.user_id,withdrawal.amount_kes,'withdrawal_refund',p_id);
  UPDATE public.kazileo_grant_awards SET withdrawal_id = NULL WHERE withdrawal_id = p_id;
END $$;
REVOKE ALL ON FUNCTION public.kazileo_request_withdrawal(bigint,text), public.kazileo_reject_withdrawal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kazileo_request_withdrawal(bigint,text), public.kazileo_reject_withdrawal(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.kazileo_submit_grant_application(text,text,text), public.kazileo_review_grant_application(uuid,boolean,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kazileo_submit_grant_application(text,text,text), public.kazileo_review_grant_application(uuid,boolean,bigint) TO authenticated;
COMMIT;
