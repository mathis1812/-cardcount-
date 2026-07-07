-- supabase/migrations/0003_billing_quotas.sql
-- Monétisation (Phase 4) : quota freemium + abonnements Stripe.
-- Écritures via fonctions SECURITY DEFINER ; subscriptions écrite par le
-- webhook (service_role, qui contourne la RLS).

-- Configuration applicative (limite quotidienne configurable)
create table public.app_config (
  key text primary key,
  value int not null
);
insert into public.app_config (key, value) values ('free_daily_limit', 3);
-- Pas de policy : table non exposée au client (lue seulement par les fonctions).
alter table public.app_config enable row level security;

-- Compteur d'usage quotidien (application du quota free)
create table public.daily_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  sessions_used int not null default 0 check (sessions_used >= 0),
  primary key (user_id, day)
);
alter table public.daily_usage enable row level security;
create policy "daily_usage_select_own"
  on public.daily_usage for select
  using (auth.uid() = user_id);

-- Miroir Stripe (écrit uniquement par le webhook, service_role)
create table public.subscriptions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  stripe_customer_id text unique,
  stripe_sub_id text,
  status text not null default 'incomplete'
    check (status in ('incomplete', 'active', 'trialing', 'past_due', 'canceled')),
  plan text check (plan in ('monthly', 'yearly')),
  current_period_end timestamptz
);
alter table public.subscriptions enable row level security;
create policy "subscriptions_select_own"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- Idempotence du webhook : un event Stripe traité une seule fois
create table public.stripe_events (
  id text primary key,
  processed_at timestamptz not null default now()
);
alter table public.stripe_events enable row level security;

-- Premium = abonnement actif/essai non expiré
create function public.is_premium(p_user_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.subscriptions s
    where s.user_id = p_user_id
      and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
  );
$$;

-- Ouvre une session : premium => illimité ; sinon incrémente le quota du jour
-- et lève 'quota_exceeded' si dépassé. Renvoie { remaining } (null si premium).
create function public.start_drill_session()
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  tz text;
  today date;
  used int;
  limit_val int;
begin
  if uid is null then
    raise exception 'non authentifié';
  end if;
  if public.is_premium(uid) then
    return json_build_object('remaining', null);
  end if;
  select coalesce(timezone, 'Europe/Paris') into tz
    from public.streaks where user_id = uid;
  today := (now() at time zone coalesce(tz, 'Europe/Paris'))::date;
  select value into limit_val from public.app_config where key = 'free_daily_limit';
  select sessions_used into used
    from public.daily_usage where user_id = uid and day = today for update;
  used := coalesce(used, 0);
  if used >= limit_val then
    raise exception 'quota_exceeded';
  end if;
  insert into public.daily_usage (user_id, day, sessions_used)
    values (uid, today, 1)
    on conflict (user_id, day)
    do update set sessions_used = public.daily_usage.sessions_used + 1;
  return json_build_object('remaining', limit_val - (used + 1));
end;
$$;

-- Statut d'abonnement pour l'affichage client
create function public.get_subscription_status()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'is_premium', public.is_premium(auth.uid()),
    'plan', (select plan from public.subscriptions where user_id = auth.uid())
  );
$$;

grant execute on function public.start_drill_session() to authenticated;
grant execute on function public.get_subscription_status() to authenticated;
