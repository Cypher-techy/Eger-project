-- Apply after 20261101_approved_grants.sql. Test only in isolated staging first.
-- New auth accounts receive rewards immediately, including unconfirmed accounts.
-- This is vulnerable to mass signup and self-referral; do not enable in production
-- without identity/abuse controls, funding limits and financial review.
BEGIN;
CREATE TABLE public.kazileo_referral_codes (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id),
  code uuid NOT NULL UNIQUE DEFAULT gen_random_uuid()
);
ALTER TABLE public.kazileo_referral_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.kazileo_referral_codes FROM PUBLIC, anon, authenticated;

ALTER TABLE public.kazileo_ledger ADD COLUMN referred_user_id uuid REFERENCES auth.users(id);
ALTER TABLE public.kazileo_ledger DROP CONSTRAINT kazileo_ledger_kind_check;
ALTER TABLE public.kazileo_ledger DROP CONSTRAINT kazileo_ledger_check;
ALTER TABLE public.kazileo_ledger ADD CONSTRAINT kazileo_ledger_kind_check CHECK (kind IN ('activity_reward','withdrawal_hold','withdrawal_refund','grant_award','welcome_bonus','referral_reward'));
ALTER TABLE public.kazileo_ledger ADD CONSTRAINT kazileo_ledger_check CHECK (
  (kind = 'activity_reward' AND amount_kes = 100 AND submission_id IS NOT NULL AND withdrawal_id IS NULL AND grant_award_id IS NULL AND referred_user_id IS NULL)
  OR (kind = 'withdrawal_hold' AND amount_kes < 0 AND withdrawal_id IS NOT NULL AND submission_id IS NULL AND grant_award_id IS NULL AND referred_user_id IS NULL)
  OR (kind = 'withdrawal_refund' AND amount_kes > 0 AND withdrawal_id IS NOT NULL AND submission_id IS NULL AND grant_award_id IS NULL AND referred_user_id IS NULL)
  OR (kind = 'grant_award' AND amount_kes >= 1200 AND grant_award_id IS NOT NULL AND submission_id IS NULL AND withdrawal_id IS NULL AND referred_user_id IS NULL)
  OR (kind = 'welcome_bonus' AND amount_kes = 1000 AND submission_id IS NULL AND withdrawal_id IS NULL AND grant_award_id IS NULL AND referred_user_id IS NULL)
  OR (kind = 'referral_reward' AND amount_kes = 100 AND submission_id IS NULL AND withdrawal_id IS NULL AND grant_award_id IS NULL AND referred_user_id IS NOT NULL AND referred_user_id <> user_id)
);
CREATE UNIQUE INDEX kazileo_one_welcome_bonus ON public.kazileo_ledger(user_id) WHERE kind = 'welcome_bonus';
CREATE UNIQUE INDEX kazileo_one_referral_reward ON public.kazileo_ledger(referred_user_id) WHERE kind = 'referral_reward';

-- Existing accounts can get a referral code, but do not retroactively receive bonuses.
CREATE FUNCTION public.kazileo_my_referral_code() RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Authentication required'; END IF;
  INSERT INTO public.kazileo_referral_codes(user_id) VALUES (auth.uid()) ON CONFLICT (user_id) DO NOTHING;
  SELECT code INTO result FROM public.kazileo_referral_codes WHERE user_id = auth.uid();
  RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.kazileo_my_referral_code() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kazileo_my_referral_code() TO authenticated;

CREATE FUNCTION public.kazileo_reward_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE referrer uuid; referral text := NEW.raw_user_meta_data ->> 'kazileo_referral_code';
BEGIN
  IF referral IS NOT NULL AND referral <> '' THEN
    IF referral !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN RAISE EXCEPTION 'Invalid referral code'; END IF;
    SELECT user_id INTO referrer FROM public.kazileo_referral_codes WHERE code = referral::uuid;
    IF referrer IS NULL OR referrer = NEW.id THEN RAISE EXCEPTION 'Invalid referral code'; END IF;
  END IF;
  INSERT INTO public.kazileo_referral_codes(user_id) VALUES (NEW.id);
  INSERT INTO public.kazileo_wallets(user_id, available_kes) VALUES (NEW.id, 1000);
  INSERT INTO public.kazileo_ledger(user_id, amount_kes, kind) VALUES (NEW.id, 1000, 'welcome_bonus');
  IF referrer IS NOT NULL THEN
    INSERT INTO public.kazileo_wallets AS wallet(user_id, available_kes) VALUES (referrer, 100)
      ON CONFLICT (user_id) DO UPDATE SET available_kes = wallet.available_kes + 100;
    INSERT INTO public.kazileo_ledger(user_id, amount_kes, kind, referred_user_id) VALUES (referrer, 100, 'referral_reward', NEW.id);
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.kazileo_reward_new_user() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER kazileo_reward_signup AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.kazileo_reward_new_user();
COMMIT;
