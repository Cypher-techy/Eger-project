-- KaziConnect initial schema. Run in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  phone_e164 text unique,
  phone_verified_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.opportunities (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null,
  description text not null,
  reward_kes integer not null check (reward_kes > 0),
  estimated_minutes integer,
  status text not null default 'draft' check (status in ('draft','published','paused','closed')),
  created_at timestamptz not null default now()
);

create table if not exists public.task_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id),
  notes text,
  status text not null default 'submitted' check (status in ('submitted','approved','rejected')),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id, opportunity_id)
);

-- Wallet ledger stores integer KES amounts. Never trust a balance sent by the browser.
create table if not exists public.wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_kes integer not null check (amount_kes > 0),
  direction text not null check (direction in ('credit','debit')),
  kind text not null check (kind in ('task_earning','promotion','deposit','withdrawal','reversal','adjustment')),
  status text not null default 'pending' check (status in ('pending','available','reserved','completed','reversed','non_withdrawable')),
  withdrawable boolean not null default false,
  reference text unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.mpesa_payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null,
  amount_kes integer not null check (amount_kes > 0),
  purpose text not null check (purpose in ('phone_verification')),
  merchant_request_id text,
  checkout_request_id text unique,
  receipt_number text unique,
  status text not null default 'initiated' check (status in ('initiated','pending','confirmed','failed','reversed')),
  result_code integer,
  result_description text,
  raw_callback jsonb,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  phone_e164 text not null,
  amount_kes integer not null check (amount_kes >= 100),
  status text not null default 'requested' check (status in ('requested','approved','processing','paid','rejected','failed')),
  admin_note text,
  mpesa_conversation_id text unique,
  mpesa_originator_conversation_id text unique,
  mpesa_receipt text,
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.platform_settings (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

-- Promotions start as non-withdrawable. Only an administrator may enable a funded promotion.
insert into public.platform_settings(key,value)
values ('welcome_promotion', jsonb_build_object('amount_kes',750,'funded',false,'enabled',true))
on conflict (key) do nothing;

alter table public.profiles enable row level security;
alter table public.opportunities enable row level security;
alter table public.task_submissions enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.mpesa_payments enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.platform_settings enable row level security;

create policy "profiles_read_own" on public.profiles for select to authenticated using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update to authenticated using (auth.uid() = id) with check (auth.uid() = id);
create policy "published_opportunities_read" on public.opportunities for select to anon, authenticated using (status = 'published');
create policy "submissions_read_own" on public.task_submissions for select to authenticated using (auth.uid() = user_id);
create policy "submissions_insert_own" on public.task_submissions for insert to authenticated with check (auth.uid() = user_id);
create policy "wallet_read_own" on public.wallet_transactions for select to authenticated using (auth.uid() = user_id);
create policy "payments_read_own" on public.mpesa_payments for select to authenticated using (auth.uid() = user_id);
create policy "withdrawals_read_own" on public.withdrawal_requests for select to authenticated using (auth.uid() = user_id);
-- No client insert/update policies for wallet, payment or withdrawal rows.
-- Use server-side service-role routes only, and validate admin identities server-side.

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles(id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

-- Intentionally no automatic KSh 750 cash credit is created by this schema.
-- Implement an audited, idempotent promotion-claim function only after funds are reserved.