-- supabase/migrations/0001_profiles_streaks_sessions.sql
-- Tables du domaine « comptes & progression » (Phase 3).
-- RLS : lecture de ses propres lignes uniquement. Aucune écriture directe :
-- les écritures passent par des fonctions SECURITY DEFINER (voir 0002).

-- profiles : extension d'auth.users
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique,
  xp_total bigint not null default 0 check (xp_total >= 0),
  level int not null default 1 check (level >= 1),
  locale text not null default 'fr',
  anon_migrated boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

-- streaks : un enregistrement par utilisateur
create table public.streaks (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  current_streak int not null default 0 check (current_streak >= 0),
  longest_streak int not null default 0 check (longest_streak >= 0),
  last_activity_on date,
  timezone text not null default 'Europe/Paris'
);
alter table public.streaks enable row level security;
create policy "streaks_select_own"
  on public.streaks for select
  using (auth.uid() = user_id);

-- drill_sessions : une ligne par session terminée
create table public.drill_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  mode text not null default 'running_count',
  difficulty jsonb not null default '{}'::jsonb,
  cards_seen int not null check (cards_seen >= 0),
  correct boolean not null,
  accuracy numeric not null check (accuracy >= 0 and accuracy <= 1),
  duration_ms int not null default 0 check (duration_ms >= 0),
  xp_earned int not null default 0 check (xp_earned >= 0 and xp_earned <= 200),
  created_at timestamptz not null default now()
);
alter table public.drill_sessions enable row level security;
create policy "drill_sessions_select_own"
  on public.drill_sessions for select
  using (auth.uid() = user_id);
create index drill_sessions_user_idx
  on public.drill_sessions (user_id, created_at desc);

-- Création automatique du profil + streak à l'inscription
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  insert into public.streaks (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
