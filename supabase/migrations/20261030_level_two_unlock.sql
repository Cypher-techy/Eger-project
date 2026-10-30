-- Apply after kazileo-ledger.sql. Admins must verify payments independently with Safaricom.
BEGIN;
ALTER TABLE public.kazileo_activities ADD COLUMN IF NOT EXISTS level smallint NOT NULL DEFAULT 1 CHECK (level IN (1,2));
CREATE TABLE public.kazileo_level_two_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  phone text NOT NULL CHECK (phone ~ '^254[17][0-9]{8}$'),
  amount_kes integer NOT NULL DEFAULT 20 CHECK (amount_kes = 20),
  status text NOT NULL DEFAULT 'initiating' CHECK (status IN ('initiating','pending','unlocked','failed')),
  checkout_request_id text UNIQUE,
  merchant_request_id text,
  verified_receipt text,
  reviewed_by uuid REFERENCES auth.users(id), reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status <> 'unlocked' OR (checkout_request_id IS NOT NULL AND verified_receipt IS NOT NULL AND length(trim(verified_receipt)) > 0))
);
CREATE UNIQUE INDEX kazileo_level_two_one_open_or_unlocked ON public.kazileo_level_two_payments(user_id) WHERE status IN ('initiating','pending','unlocked');
CREATE UNIQUE INDEX kazileo_level_two_receipt ON public.kazileo_level_two_payments(upper(trim(verified_receipt))) WHERE verified_receipt IS NOT NULL;
ALTER TABLE public.kazileo_level_two_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY kazileo_level_two_read ON public.kazileo_level_two_payments FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.kazileo_is_admin());
GRANT SELECT ON public.kazileo_level_two_payments TO authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.kazileo_level_two_payments FROM PUBLIC, anon, authenticated;

-- Block access to level-two content and submissions until a global unlock is approved.
DROP POLICY IF EXISTS activities_read ON public.kazileo_activities;
CREATE POLICY activities_read ON public.kazileo_activities FOR SELECT TO authenticated USING (
  public.kazileo_is_admin() OR (active AND (level = 1 OR EXISTS (
    SELECT 1 FROM public.kazileo_level_two_payments p WHERE p.user_id = auth.uid() AND p.status = 'unlocked'
  )))
);
CREATE OR REPLACE FUNCTION public.kazileo_submit(p_activity_id uuid, p_answer text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid; actor uuid := auth.uid();
BEGIN
  IF actor IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.kazileo_activities a WHERE a.id = p_activity_id AND a.active AND (a.level = 1 OR EXISTS (
    SELECT 1 FROM public.kazileo_level_two_payments p WHERE p.user_id = actor AND p.status = 'unlocked'
  ))) THEN RAISE EXCEPTION 'Activity unavailable'; END IF;
  INSERT INTO public.kazileo_submissions(user_id, activity_id, answer) VALUES (actor, p_activity_id, p_answer) RETURNING id INTO result;
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.kazileo_submit(uuid,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kazileo_submit(uuid,text) TO authenticated;

CREATE FUNCTION public.kazileo_review_level_two(p_id uuid, p_approve boolean, p_receipt text DEFAULT NULL) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE payment public.kazileo_level_two_payments%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kazileo_is_admin() THEN RAISE EXCEPTION 'Admin required'; END IF;
  IF p_approve IS NULL THEN RAISE EXCEPTION 'Decision required'; END IF;
  SELECT * INTO payment FROM public.kazileo_level_two_payments WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR payment.status NOT IN ('initiating','pending') THEN RAISE EXCEPTION 'Payment is not awaiting review'; END IF;
  IF p_approve AND (payment.checkout_request_id IS NULL OR p_receipt IS NULL OR length(trim(p_receipt)) NOT BETWEEN 1 AND 100) THEN
    RAISE EXCEPTION 'Checkout ID and independently verified receipt required';
  END IF;
  UPDATE public.kazileo_level_two_payments SET status = CASE WHEN p_approve THEN 'unlocked' ELSE 'failed' END,
    verified_receipt = CASE WHEN p_approve THEN trim(p_receipt) ELSE NULL END,
    reviewed_by = auth.uid(), reviewed_at = now() WHERE id = p_id;
END $$;
REVOKE ALL ON FUNCTION public.kazileo_review_level_two(uuid,boolean,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kazileo_review_level_two(uuid,boolean,text) TO authenticated;
COMMIT;
