-- supabase/migrations/0002_functions.sql
-- Logique serveur (source de vérité). Toutes SECURITY DEFINER : elles
-- contournent la RLS pour écrire, mais n'agissent que sur auth.uid().

-- Niveau à partir de l'XP totale — identique à la formule engine :
-- xp_requis(n) = round(100 * (n-1)^1.5), niveau 1 à 0 XP.
create function public.level_from_xp(p_xp bigint)
returns int
language plpgsql
immutable
as $$
declare
  lvl int := 1;
begin
  while round(100 * power(lvl::numeric, 1.5)) <= p_xp loop
    lvl := lvl + 1;
  end loop;
  return lvl;
end;
$$;

-- Met à jour la streak selon le jour civil dans le fuseau de l'utilisateur.
create function public.record_activity(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  tz text;
  today date;
  last date;
begin
  select timezone, last_activity_on into tz, last
    from public.streaks where user_id = p_user_id for update;
  today := (now() at time zone tz)::date;
  if last is null or last < today - 1 then
    update public.streaks
      set current_streak = 1,
          longest_streak = greatest(longest_streak, 1),
          last_activity_on = today
      where user_id = p_user_id;
  elsif last = today - 1 then
    update public.streaks
      set current_streak = current_streak + 1,
          longest_streak = greatest(longest_streak, current_streak + 1),
          last_activity_on = today
      where user_id = p_user_id;
  end if; -- last = today : rien à faire
end;
$$;

-- Profil courant (auth.uid()) sous forme json.
create function public.get_profile()
returns json
language sql
security definer
set search_path = public
stable
as $$
  select json_build_object(
    'xp_total', p.xp_total,
    'level', p.level,
    'current_streak', coalesce(s.current_streak, 0),
    'longest_streak', coalesce(s.longest_streak, 0)
  )
  from public.profiles p
  left join public.streaks s on s.user_id = p.id
  where p.id = auth.uid();
$$;

-- Enregistre une session terminée : borne l'XP, met à jour profil + streak,
-- renvoie le profil à jour.
create function public.record_drill_session(
  p_tier int,
  p_correct boolean,
  p_accuracy numeric,
  p_cards_seen int,
  p_duration_ms int,
  p_xp_earned int,
  p_difficulty jsonb
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  capped_xp int;
begin
  if uid is null then
    raise exception 'non authentifié';
  end if;
  capped_xp := least(greatest(p_xp_earned, 0), 200);
  insert into public.drill_sessions
    (user_id, mode, difficulty, cards_seen, correct, accuracy, duration_ms, xp_earned)
  values
    (uid, 'running_count', coalesce(p_difficulty, '{}'::jsonb),
     greatest(p_cards_seen, 0), p_correct, least(greatest(p_accuracy, 0), 1),
     greatest(p_duration_ms, 0), capped_xp);
  update public.profiles
    set xp_total = xp_total + capped_xp,
        level = public.level_from_xp(xp_total + capped_xp)
    where id = uid;
  perform public.record_activity(uid);
  return public.get_profile();
end;
$$;

-- Migration unique de l'XP anonyme, plafonnée à 500 (anti-triche).
create function public.migrate_anonymous_progress(p_xp int)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  capped int;
begin
  if uid is null then
    raise exception 'non authentifié';
  end if;
  capped := least(greatest(p_xp, 0), 500);
  update public.profiles
    set xp_total = xp_total + capped,
        level = public.level_from_xp(xp_total + capped),
        anon_migrated = true
    where id = uid and anon_migrated = false;
  return public.get_profile();
end;
$$;

-- Le client (rôle authenticated) n'appelle que ces trois RPC.
grant execute on function public.get_profile() to authenticated;
grant execute on function public.record_drill_session(int, boolean, numeric, int, int, int, jsonb) to authenticated;
grant execute on function public.migrate_anonymous_progress(int) to authenticated;
