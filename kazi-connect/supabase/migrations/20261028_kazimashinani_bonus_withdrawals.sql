-- Apply this migration to an existing KaziConnect/KaziMashinani Supabase project.
-- Only keep funded=true while KES 750 per eligible account is reserved for payout.
insert into public.platform_settings(key,value)
values ('welcome_promotion', jsonb_build_object('amount_kes',750,'funded',true,'enabled',true))
on conflict (key) do update set value = jsonb_set(
  jsonb_set(public.platform_settings.value, '{amount_kes}', '750'::jsonb, true),
  '{funded}', 'true'::jsonb, true
), updated_at = now();

create or replace function public.confirm_phone_verification(
  p_checkout_request_id text,
  p_receipt_number text,
  p_raw_callback jsonb
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  payment_row public.mpesa_payments%rowtype;
  promotion_row public.platform_settings%rowtype;
  bonus_amount integer;
begin
  select * into payment_row
  from public.mpesa_payments
  where checkout_request_id = p_checkout_request_id
  for update;

  if not found then
    raise exception 'Payment not found';
  end if;

  if payment_row.status = 'confirmed' then
    return 'already_confirmed';
  end if;

  if payment_row.status <> 'pending'
     or payment_row.purpose <> 'phone_verification'
     or payment_row.amount_kes <> 70
     or p_receipt_number is null
     or length(trim(p_receipt_number)) = 0 then
    raise exception 'Payment is not eligible for confirmation';
  end if;

  update public.profiles
  set phone_e164 = payment_row.phone_e164,
      phone_verified_at = now()
  where id = payment_row.user_id;

  if not found then
    raise exception 'Profile not found';
  end if;

  update public.mpesa_payments
  set status = 'confirmed',
      result_code = 0,
      result_description = 'Payment confirmed by Safaricom STK Query',
      receipt_number = p_receipt_number,
      raw_callback = p_raw_callback,
      confirmed_at = now()
  where id = payment_row.id;

  -- Lock the promotion setting and credit at most once per account.
  select * into promotion_row
  from public.platform_settings
  where key = 'welcome_promotion'
  for update;

  if found
     and coalesce((promotion_row.value->>'enabled')::boolean, false)
     and coalesce((promotion_row.value->>'funded')::boolean, false) then
    bonus_amount := coalesce((promotion_row.value->>'amount_kes')::integer, 750);
    if bonus_amount = 750 then
      insert into public.wallet_transactions(
        user_id, amount_kes, direction, kind, status, withdrawable, reference, description
      ) values (
        payment_row.user_id, 750, 'credit', 'promotion', 'available', true,
        'welcome-bonus:' || payment_row.user_id::text,
        'KaziMashinani Jobs welcome bonus'
      ) on conflict (reference) do nothing;
    end if;
  end if;

  return 'confirmed';
end;
$$;


revoke all on function public.confirm_phone_verification(text,text,jsonb) from public, anon, authenticated;
grant execute on function public.confirm_phone_verification(text,text,jsonb) to service_role;

create or replace function public.request_withdrawal(
  p_user_id uuid,
  p_amount_kes integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  profile_row public.profiles%rowtype;
  ledger_balance bigint;
  pending_amount bigint;
  request_id uuid;
begin
  if p_amount_kes is null or p_amount_kes < 100 then
    raise exception 'Minimum withdrawal is KSh 100';
  end if;

  select * into profile_row from public.profiles where id = p_user_id for update;
  if not found or profile_row.phone_verified_at is null or profile_row.phone_e164 is null then
    raise exception 'Verify your phone before requesting a withdrawal';
  end if;

  select coalesce(sum(case when direction = 'credit' then amount_kes else -amount_kes end),0)
  into ledger_balance
  from public.wallet_transactions
  where user_id = p_user_id and withdrawable = true and status in ('available','completed');

  select coalesce(sum(amount_kes),0) into pending_amount
  from public.withdrawal_requests
  where user_id = p_user_id and status in ('requested','approved','processing');

  if p_amount_kes > ledger_balance - pending_amount then
    raise exception 'Insufficient available balance';
  end if;

  insert into public.withdrawal_requests(user_id, phone_e164, amount_kes, status)
  values (p_user_id, profile_row.phone_e164, p_amount_kes, 'requested')
  returning id into request_id;

  return request_id;
end;
$$;


revoke all on function public.request_withdrawal(uuid,integer) from public, anon, authenticated;
grant execute on function public.request_withdrawal(uuid,integer) to service_role;
