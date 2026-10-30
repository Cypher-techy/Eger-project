-- KaziLeo financial foundation. Run in Supabase SQL editor as the project owner.
-- This does not activate the demo UI or initiate payments.
-- Administrators are provisioned manually in kazileo_admins, never via public signup.
CREATE TABLE public.kazileo_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
CREATE TABLE public.kazileo_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 200),
  instructions text NOT NULL CHECK (length(trim(instructions)) BETWEEN 1 AND 10000),
  active boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.kazileo_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  activity_id uuid NOT NULL REFERENCES public.kazileo_activities(id),
  answer text NOT NULL CHECK (length(trim(answer)) BETWEEN 1 AND 10000),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, activity_id)
);
CREATE TABLE public.kazileo_wallets (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  available_kes bigint NOT NULL DEFAULT 0 CHECK (available_kes >= 0)
);
CREATE TABLE public.kazileo_withdrawals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  amount_kes bigint NOT NULL CHECK (amount_kes >= 1200),
  phone text NOT NULL CHECK (phone ~ '^254[17][0-9]{8}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paying','paid','rejected')),
  receipt text, reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'paid' OR (receipt IS NOT NULL AND length(trim(receipt)) > 0))
);
CREATE UNIQUE INDEX kazileo_one_open_withdrawal ON public.kazileo_withdrawals(user_id)
  WHERE status IN ('pending','paying');
CREATE UNIQUE INDEX kazileo_unique_receipt ON public.kazileo_withdrawals(upper(trim(receipt))) WHERE receipt IS NOT NULL;
CREATE TABLE public.kazileo_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL REFERENCES auth.users(id),
  amount_kes bigint NOT NULL CHECK (amount_kes <> 0),
  kind text NOT NULL CHECK (kind IN ('activity_reward','withdrawal_hold','withdrawal_refund')),
  submission_id uuid REFERENCES public.kazileo_submissions(id),
  withdrawal_id uuid REFERENCES public.kazileo_withdrawals(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((kind = 'activity_reward' AND amount_kes = 100 AND submission_id IS NOT NULL AND withdrawal_id IS NULL)
      OR (kind = 'withdrawal_hold' AND amount_kes < 0 AND withdrawal_id IS NOT NULL AND submission_id IS NULL)
      OR (kind = 'withdrawal_refund' AND amount_kes > 0 AND withdrawal_id IS NOT NULL AND submission_id IS NULL))
);
CREATE UNIQUE INDEX kazileo_one_reward ON public.kazileo_ledger(submission_id) WHERE kind = 'activity_reward';
CREATE UNIQUE INDEX kazileo_one_hold ON public.kazileo_ledger(withdrawal_id) WHERE kind = 'withdrawal_hold';
CREATE UNIQUE INDEX kazileo_one_refund ON public.kazileo_ledger(withdrawal_id) WHERE kind = 'withdrawal_refund';

ALTER TABLE public.kazileo_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kazileo_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kazileo_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kazileo_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kazileo_withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kazileo_ledger ENABLE ROW LEVEL SECURITY;

-- No direct client writes. All financial changes are serialized in functions below.
CREATE FUNCTION public.kazileo_is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = '' AS $$ SELECT EXISTS (SELECT 1 FROM public.kazileo_admins WHERE user_id = auth.uid()) $$;
REVOKE ALL ON FUNCTION public.kazileo_is_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.kazileo_is_admin() TO authenticated;
CREATE POLICY activities_read ON public.kazileo_activities FOR SELECT TO authenticated USING (active OR public.kazileo_is_admin());
CREATE POLICY submissions_read ON public.kazileo_submissions FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.kazileo_is_admin());
CREATE POLICY wallets_read ON public.kazileo_wallets FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.kazileo_is_admin());
CREATE POLICY withdrawals_read ON public.kazileo_withdrawals FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.kazileo_is_admin());
CREATE POLICY ledger_read ON public.kazileo_ledger FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.kazileo_is_admin());
GRANT SELECT ON public.kazileo_activities, public.kazileo_submissions, public.kazileo_wallets, public.kazileo_withdrawals, public.kazileo_ledger TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.kazileo_activities, public.kazileo_submissions, public.kazileo_wallets, public.kazileo_withdrawals, public.kazileo_ledger FROM anon, authenticated;

CREATE FUNCTION public.kazileo_submit(p_activity_id uuid, p_answer text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid; actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kazileo_activities WHERE id = p_activity_id AND active) THEN RAISE EXCEPTION 'Activity unavailable'; END IF;
  INSERT INTO public.kazileo_submissions(user_id, activity_id, answer) VALUES (actor, p_activity_id, p_answer) RETURNING id INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.kazileo_review_submission(p_id uuid, p_approve boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE submission public.kazileo_submissions%ROWTYPE; actor uuid := auth.uid();
BEGIN
  IF actor IS NULL OR NOT public.kazileo_is_admin() THEN RAISE EXCEPTION 'Admin required'; END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION 'Review decision required'; END IF;
  SELECT * INTO submission FROM public.kazileo_submissions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR submission.status <> 'pending' THEN RAISE EXCEPTION 'Submission is not pending'; END IF;
  UPDATE public.kazileo_submissions SET status = CASE WHEN p_approve THEN 'approved' ELSE 'rejected' END, reviewed_by = actor, reviewed_at = now() WHERE id = p_id;
  IF p_approve THEN
    INSERT INTO public.kazileo_wallets(user_id, available_kes) VALUES (submission.user_id, 0) ON CONFLICT (user_id) DO NOTHING;
    UPDATE public.kazileo_wallets SET available_kes = available_kes + 100 WHERE user_id = submission.user_id;
    INSERT INTO public.kazileo_ledger(user_id, amount_kes, kind, submission_id) VALUES (submission.user_id, 100, 'activity_reward', p_id);
  END IF;
END $$;

CREATE FUNCTION public.kazileo_request_withdrawal(p_amount bigint, p_phone text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid; actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_amount IS NULL OR p_amount < 1200 OR p_phone IS NULL OR p_phone !~ '^254[17][0-9]{8}$' THEN RAISE EXCEPTION 'Invalid amount or Kenyan phone number'; END IF;
  UPDATE public.kazileo_wallets SET available_kes = available_kes - p_amount WHERE user_id = actor AND available_kes >= p_amount;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient available balance'; END IF;
  INSERT INTO public.kazileo_withdrawals(user_id, amount_kes, phone) VALUES (actor, p_amount, p_phone) RETURNING id INTO result;
  INSERT INTO public.kazileo_ledger(user_id, amount_kes, kind, withdrawal_id) VALUES (actor, -p_amount, 'withdrawal_hold', result);
  RETURN result;
END $$;

-- Claim before manually sending money. A paying withdrawal cannot be rejected/refunded:
-- resolve uncertain transfers with Safaricom and reconcile before marking paid.
CREATE FUNCTION public.kazileo_claim_withdrawal(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.kazileo_is_admin() THEN RAISE EXCEPTION 'Admin required'; END IF;
  UPDATE public.kazileo_withdrawals SET status = 'paying', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal is not pending'; END IF;
END $$;
CREATE FUNCTION public.kazileo_finish_withdrawal(p_id uuid, p_receipt text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.kazileo_is_admin() THEN RAISE EXCEPTION 'Admin required'; END IF;
  IF p_receipt IS NULL OR length(trim(p_receipt)) NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Receipt required'; END IF;
  UPDATE public.kazileo_withdrawals SET status = 'paid', receipt = trim(p_receipt), reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id AND status = 'paying';
  IF NOT FOUND THEN RAISE EXCEPTION 'Withdrawal is not being paid'; END IF;
END $$;
CREATE FUNCTION public.kazileo_reject_withdrawal(p_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE withdrawal public.kazileo_withdrawals%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kazileo_is_admin() THEN RAISE EXCEPTION 'Admin required'; END IF;
  SELECT * INTO withdrawal FROM public.kazileo_withdrawals WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR withdrawal.status <> 'pending' THEN RAISE EXCEPTION 'Only pending withdrawals can be rejected'; END IF;
  UPDATE public.kazileo_withdrawals SET status = 'rejected', reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id;
  UPDATE public.kazileo_wallets SET available_kes = available_kes + withdrawal.amount_kes WHERE user_id = withdrawal.user_id;
  INSERT INTO public.kazileo_ledger(user_id, amount_kes, kind, withdrawal_id) VALUES (withdrawal.user_id, withdrawal.amount_kes, 'withdrawal_refund', p_id);
END $$;
REVOKE ALL ON FUNCTION public.kazileo_submit(uuid,text), public.kazileo_review_submission(uuid,boolean), public.kazileo_request_withdrawal(bigint,text), public.kazileo_claim_withdrawal(uuid), public.kazileo_finish_withdrawal(uuid,text), public.kazileo_reject_withdrawal(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kazileo_submit(uuid,text), public.kazileo_review_submission(uuid,boolean), public.kazileo_request_withdrawal(bigint,text), public.kazileo_claim_withdrawal(uuid), public.kazileo_finish_withdrawal(uuid,text), public.kazileo_reject_withdrawal(uuid) TO authenticated;
