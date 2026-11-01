-- Apply after the level-two migration. Only provisioned administrators may manage activities.
BEGIN;
CREATE FUNCTION public.kazileo_create_activity(p_title text, p_instructions text, p_level smallint) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.kazileo_is_admin() THEN RAISE EXCEPTION 'Admin required'; END IF;
  IF p_title IS NULL OR length(trim(p_title)) NOT BETWEEN 1 AND 200
    OR p_instructions IS NULL OR length(trim(p_instructions)) NOT BETWEEN 1 AND 10000
    OR p_level IS NULL OR p_level NOT IN (1, 2) THEN RAISE EXCEPTION 'Invalid activity details'; END IF;
  INSERT INTO public.kazileo_activities(title, instructions, level, active)
  VALUES (trim(p_title), trim(p_instructions), p_level, false) RETURNING id INTO result;
  RETURN result;
END $$;

CREATE FUNCTION public.kazileo_set_activity_active(p_id uuid, p_active boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.kazileo_is_admin() THEN RAISE EXCEPTION 'Admin required'; END IF;
  IF p_active IS NULL THEN RAISE EXCEPTION 'Activity status required'; END IF;
  UPDATE public.kazileo_activities SET active = p_active WHERE id = p_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Activity not found'; END IF;
END $$;
REVOKE ALL ON FUNCTION public.kazileo_create_activity(text,text,smallint), public.kazileo_set_activity_active(uuid,boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.kazileo_create_activity(text,text,smallint), public.kazileo_set_activity_active(uuid,boolean) TO authenticated;
COMMIT;
