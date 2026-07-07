# Phase 3 — Comptes & progression Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Comptes utilisateurs (auth email/mot de passe Supabase), schéma Postgres sous RLS avec source de vérité serveur pour XP/streak, migration unique de l'XP anonyme au premier compte, affichage profil/XP/streak.

**Architecture:** Migrations SQL versionnées sous `supabase/migrations/` (appliquées à la main sur Supabase). Côté client : une couche d'accès mince (`src/lib/authClient.ts`, `src/lib/profileApi.ts`) qui enveloppe le client Supabase et n'expose que des fonctions async pures et testables (mockées en test) ; des stores Zustand (`authStore`, `serverProfileStore`) pour l'état de session et le profil serveur ; l'UI d'auth (`AuthPanel`) et le câblage dans `DrillScreen`. Toute la logique d'XP/streak vit dans des fonctions Postgres `SECURITY DEFINER` : le client appelle des RPC, jamais d'écriture directe.

**Tech Stack:** Supabase (Auth + Postgres + RLS + fonctions plpgsql), `@supabase/supabase-js` (déjà installé), Zustand (déjà installé), react-i18next, Vitest + RTL (client Supabase mocké).

## Global Constraints

- RLS sur toutes les tables ; l'utilisateur ne lit que ses propres lignes (spec §4). Aucune policy d'écriture directe : les écritures passent par des RPC `SECURITY DEFINER` (spec §3 « le client affiche, le serveur décide »).
- Le serveur est la seule source de vérité pour l'XP, le niveau et la streak (spec §3, §6). L'XP par session est bornée serveur à `XP_SESSION_MAX = 200` (CHECK + clamp dans la RPC), miroir de la borne engine.
- Migration de l'XP anonyme : unique et plafonnée à `ANON_XP_MIGRATION_CAP = 500` côté serveur (spec §3 « migration unique … plafonnée, anti-triche »).
- Sécurité : uniquement l'anon key Supabase côté client (déjà dans `.env`) ; aucun secret/service_role dans le bundle (spec §3).
- Hors périmètre de cette phase (→ Phase 4) : `daily_usage`, quotas, `is_premium`, `subscriptions`, Google OAuth. On ne crée que `profiles`, `streaks`, `drill_sessions`.
- Zéro texte en dur : toute chaîne visible via `t('...')` (spec §2).
- Les migrations SQL sont **appliquées à la main** (Supabase SQL editor ou `supabase db push`) : étape humaine marquée 🧑. Le code TS reste testé à 100 % avec le client mocké.
- Formule de niveau serveur = formule engine : `xp_requis(n) = round(100 × (n-1)^1.5)`, niveau 1 à 0 XP.
- Style projet : Prettier `semi: false, singleQuote: true` ; conventional commits ; un commit par tâche ; `npm run lint && npm run typecheck && npm run test` avant chaque commit. Seuils de couverture bloquants : global ≥ 80 %, `src/engine/**` = 100 %.

## Note d'architecture (déviation documentée)

Le spec §3 prévoit TanStack Query pour les données serveur. En Phase 3, les lectures
serveur se limitent au profil/streak d'un seul utilisateur : elles sont gérées par un
petit store Zustand (`serverProfileStore`) + rechargement explicite après chaque session.
TanStack Query sera introduit en Phase 4, quand les lectures serveur se multiplient
(abonnement, usage). Cette simplification respecte YAGNI sans fermer la porte.

## File Structure

```
supabase/
├── README.md                                  — comment appliquer les migrations
└── migrations/
    ├── 0001_profiles_streaks_sessions.sql     — tables + RLS (select-only) + trigger nouvel utilisateur
    └── 0002_functions.sql                     — level_from_xp, record_activity, get_profile,
                                                  record_drill_session, migrate_anonymous_progress + grants
src/lib/
├── authClient.ts                              — signUp, signIn, signOut, getCurrentUserId, onAuthChange
├── authClient.test.ts
├── profileApi.ts                              — ServerProfile, fetchProfile, recordDrillSession, migrateAnonymousProgress
└── profileApi.test.ts
src/features/auth/
├── authStore.ts                               — Zustand : userId, status
├── authStore.test.ts
├── initAuth.ts                                — synchronise authStore avec Supabase (appelé dans main.tsx)
├── initAuth.test.ts
├── AuthPanel.tsx                              — formulaire inscription/connexion/déconnexion
└── AuthPanel.test.tsx
src/features/drill/
├── serverProfileStore.ts                      — Zustand : profil serveur (xp/level/streak)
├── serverProfileStore.test.ts
└── DrillScreen.tsx (modifié)                  — sauvegarde serveur si connecté, affiche stats serveur
src/App.tsx (modifié)                          — héberge AuthPanel, orchestre migration à l'inscription
main.tsx (modifié)                             — appelle initAuth()
```

---

### Task 1: 🧑 Migration SQL — tables, RLS, trigger nouvel utilisateur

**Files:**
- Create: `supabase/migrations/0001_profiles_streaks_sessions.sql`
- Create: `supabase/README.md`

**Interfaces:**
- Consumes: rien (SQL).
- Produces: tables `public.profiles`, `public.streaks`, `public.drill_sessions` ; policies RLS SELECT-only ; trigger `on_auth_user_created` qui crée profil + streak à l'inscription.

Cette tâche produit des fichiers SQL versionnés. Elle n'a pas de test automatisé (pas de Postgres local) : la vérification est manuelle dans Supabase (Task 8). Ces fichiers ne contiennent que du DDL, aucun secret.

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Write the apply guide**

```markdown
<!-- supabase/README.md -->
# Migrations Supabase — CardCount

Migrations SQL versionnées, à appliquer dans l'ordre sur le projet Supabase
(région EU). Source de vérité du schéma : ces fichiers.

## Appliquer (option A — SQL editor, recommandé au MVP)

1. Ouvrir le projet Supabase → **SQL Editor**.
2. Coller le contenu de `migrations/0001_profiles_streaks_sessions.sql`, exécuter.
3. Coller le contenu de `migrations/0002_functions.sql`, exécuter.
4. **Auth → Providers → Email** : désactiver « Confirm email » pour le MVP
   (l'inscription ouvre une session immédiatement). Réactivable plus tard.

## Appliquer (option B — CLI)

    npm i -g supabase
    supabase link --project-ref <ref>
    supabase db push

## Vérifier

- **Table Editor** : `profiles`, `streaks`, `drill_sessions` présentes, RLS activé (cadenas).
- Créer un utilisateur test (Auth → Add user) → une ligne apparaît dans `profiles` et `streaks`.
- **Database → Functions** : `handle_new_user`, `level_from_xp`, `record_activity`,
  `get_profile`, `record_drill_session`, `migrate_anonymous_progress`.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0001_profiles_streaks_sessions.sql supabase/README.md
git commit -m "feat(db): schéma profiles/streaks/drill_sessions, RLS, trigger nouvel utilisateur"
```

L'application effective sur Supabase se fait en Task 8 (les deux fichiers d'un coup).

---

### Task 2: 🧑 Migration SQL — fonctions XP/streak/session

**Files:**
- Create: `supabase/migrations/0002_functions.sql`

**Interfaces:**
- Consumes: tables de Task 1.
- Produces: RPC appelées par le client — `get_profile() → json`, `record_drill_session(p_tier int, p_correct boolean, p_accuracy numeric, p_cards_seen int, p_duration_ms int, p_xp_earned int, p_difficulty jsonb) → json`, `migrate_anonymous_progress(p_xp int) → json`. Chaque json a la forme `{ xp_total, level, current_streak, longest_streak }`.

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Commit**

```bash
git add supabase/migrations/0002_functions.sql
git commit -m "feat(db): fonctions level_from_xp, record_activity, record_drill_session, migration XP"
```

---

### Task 3: authClient — enveloppe de Supabase Auth

**Files:**
- Create: `src/lib/authClient.ts`
- Test: `src/lib/authClient.test.ts`

**Interfaces:**
- Consumes: `getSupabase` de `./supabase`.
- Produces: `signUp(email: string, password: string): Promise<{ userId: string; needsConfirmation: boolean }>` ; `signIn(email: string, password: string): Promise<{ userId: string }>` ; `signOut(): Promise<void>` ; `getCurrentUserId(): Promise<string | null>` ; `onAuthChange(cb: (userId: string | null) => void): () => void`. Toutes propagent une `Error` (message serveur) en cas d'échec.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/authClient.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  getCurrentUserId,
  onAuthChange,
  signIn,
  signOut,
  signUp,
} from './authClient'
import { getSupabase } from './supabase'

vi.mock('./supabase', () => ({ getSupabase: vi.fn() }))

const mockAuth = (auth: Record<string, unknown>) => {
  vi.mocked(getSupabase).mockReturnValue({ auth } as never)
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('signUp', () => {
  test('retourne l’userId et needsConfirmation=false quand une session est ouverte', async () => {
    mockAuth({
      signUp: vi.fn().mockResolvedValue({
        data: { user: { id: 'u1' }, session: { access_token: 't' } },
        error: null,
      }),
    })
    await expect(signUp('a@b.fr', 'secret123')).resolves.toEqual({
      userId: 'u1',
      needsConfirmation: false,
    })
  })

  test('needsConfirmation=true quand la session est nulle', async () => {
    mockAuth({
      signUp: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'u1' }, session: null }, error: null }),
    })
    await expect(signUp('a@b.fr', 'secret123')).resolves.toEqual({
      userId: 'u1',
      needsConfirmation: true,
    })
  })

  test('propage l’erreur serveur', async () => {
    mockAuth({
      signUp: vi.fn().mockResolvedValue({ data: {}, error: { message: 'déjà pris' } }),
    })
    await expect(signUp('a@b.fr', 'x')).rejects.toThrow('déjà pris')
  })
})

describe('signIn', () => {
  test('retourne l’userId', async () => {
    mockAuth({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: { user: { id: 'u2' } }, error: null }),
    })
    await expect(signIn('a@b.fr', 'secret123')).resolves.toEqual({ userId: 'u2' })
  })

  test('propage l’erreur', async () => {
    mockAuth({
      signInWithPassword: vi
        .fn()
        .mockResolvedValue({ data: {}, error: { message: 'identifiants invalides' } }),
    })
    await expect(signIn('a@b.fr', 'x')).rejects.toThrow('identifiants invalides')
  })
})

describe('signOut', () => {
  test('résout sans erreur', async () => {
    mockAuth({ signOut: vi.fn().mockResolvedValue({ error: null }) })
    await expect(signOut()).resolves.toBeUndefined()
  })

  test('propage l’erreur', async () => {
    mockAuth({ signOut: vi.fn().mockResolvedValue({ error: { message: 'échec' } }) })
    await expect(signOut()).rejects.toThrow('échec')
  })
})

describe('getCurrentUserId', () => {
  test('retourne l’id de session ou null', async () => {
    mockAuth({
      getSession: vi
        .fn()
        .mockResolvedValue({ data: { session: { user: { id: 'u3' } } } }),
    })
    await expect(getCurrentUserId()).resolves.toBe('u3')
    mockAuth({ getSession: vi.fn().mockResolvedValue({ data: { session: null } }) })
    await expect(getCurrentUserId()).resolves.toBeNull()
  })
})

describe('onAuthChange', () => {
  test('appelle le callback avec l’userId et retourne un désabonnement', () => {
    const unsubscribe = vi.fn()
    let handler: (event: string, session: unknown) => void = () => {}
    mockAuth({
      onAuthStateChange: vi.fn((cb) => {
        handler = cb
        return { data: { subscription: { unsubscribe } } }
      }),
    })
    const seen: (string | null)[] = []
    const off = onAuthChange((id) => seen.push(id))
    handler('SIGNED_IN', { user: { id: 'u4' } })
    handler('SIGNED_OUT', null)
    expect(seen).toEqual(['u4', null])
    off()
    expect(unsubscribe).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/authClient.test.ts`
Expected: FAIL — `Failed to resolve import "./authClient"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/authClient.ts
import { getSupabase } from './supabase'

export interface SignUpResult {
  readonly userId: string
  readonly needsConfirmation: boolean
}

export async function signUp(email: string, password: string): Promise<SignUpResult> {
  const { data, error } = await getSupabase().auth.signUp({ email, password })
  if (error) {
    throw new Error(error.message)
  }
  return { userId: data.user?.id ?? '', needsConfirmation: data.session === null }
}

export async function signIn(
  email: string,
  password: string,
): Promise<{ userId: string }> {
  const { data, error } = await getSupabase().auth.signInWithPassword({
    email,
    password,
  })
  if (error) {
    throw new Error(error.message)
  }
  return { userId: data.user.id }
}

export async function signOut(): Promise<void> {
  const { error } = await getSupabase().auth.signOut()
  if (error) {
    throw new Error(error.message)
  }
}

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession()
  return data.session?.user.id ?? null
}

export function onAuthChange(cb: (userId: string | null) => void): () => void {
  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
    cb(session?.user.id ?? null)
  })
  return () => data.subscription.unsubscribe()
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/authClient.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npx prettier --write src/lib && npm run test`
Expected: tout vert.

```bash
git add src/lib/authClient.ts src/lib/authClient.test.ts
git commit -m "feat(auth): couche authClient (signUp/signIn/signOut/session)"
```

---

### Task 4: authStore + initAuth

**Files:**
- Create: `src/features/auth/authStore.ts`
- Create: `src/features/auth/initAuth.ts`
- Test: `src/features/auth/authStore.test.ts`, `src/features/auth/initAuth.test.ts`

**Interfaces:**
- Consumes: `getCurrentUserId`, `onAuthChange` de `../../lib/authClient` ; Zustand.
- Produces: `type AuthStatus = 'loading' | 'authenticated' | 'anonymous'` ; `useAuthStore` avec `{ userId: string | null; status: AuthStatus; setUser: (id: string | null) => void }` ; `initAuth(): Promise<() => void>` qui hydrate le store et s'abonne (retourne le désabonnement).

- [ ] **Step 1: Write the failing tests**

```ts
// src/features/auth/authStore.test.ts
import { beforeEach, describe, expect, test } from 'vitest'
import { useAuthStore } from './authStore'

describe('useAuthStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ userId: null, status: 'loading' })
  })

  test('état initial : loading', () => {
    expect(useAuthStore.getState().status).toBe('loading')
    expect(useAuthStore.getState().userId).toBeNull()
  })

  test('setUser avec un id passe à authenticated', () => {
    useAuthStore.getState().setUser('u1')
    expect(useAuthStore.getState()).toMatchObject({ userId: 'u1', status: 'authenticated' })
  })

  test('setUser(null) passe à anonymous', () => {
    useAuthStore.getState().setUser('u1')
    useAuthStore.getState().setUser(null)
    expect(useAuthStore.getState()).toMatchObject({ userId: null, status: 'anonymous' })
  })
})
```

```ts
// src/features/auth/initAuth.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import * as authClient from '../../lib/authClient'
import { useAuthStore } from './authStore'
import { initAuth } from './initAuth'

vi.mock('../../lib/authClient')

afterEach(() => {
  vi.clearAllMocks()
  useAuthStore.setState({ userId: null, status: 'loading' })
})

describe('initAuth', () => {
  test('hydrate le store avec la session courante et s’abonne', async () => {
    vi.mocked(authClient.getCurrentUserId).mockResolvedValue('u9')
    let changeHandler: (id: string | null) => void = () => {}
    const off = vi.fn()
    vi.mocked(authClient.onAuthChange).mockImplementation((cb) => {
      changeHandler = cb
      return off
    })

    const unsubscribe = await initAuth()
    expect(useAuthStore.getState()).toMatchObject({ userId: 'u9', status: 'authenticated' })

    changeHandler(null)
    expect(useAuthStore.getState()).toMatchObject({ userId: null, status: 'anonymous' })

    unsubscribe()
    expect(off).toHaveBeenCalled()
  })

  test('sans session : anonymous', async () => {
    vi.mocked(authClient.getCurrentUserId).mockResolvedValue(null)
    vi.mocked(authClient.onAuthChange).mockReturnValue(vi.fn())
    await initAuth()
    expect(useAuthStore.getState().status).toBe('anonymous')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/features/auth/authStore.test.ts src/features/auth/initAuth.test.ts`
Expected: FAIL — imports non résolus.

- [ ] **Step 3: Write the implementations**

```ts
// src/features/auth/authStore.ts
import { create } from 'zustand'

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthState {
  readonly userId: string | null
  readonly status: AuthStatus
  setUser: (userId: string | null) => void
}

export const useAuthStore = create<AuthState>((set) => ({
  userId: null,
  status: 'loading',
  setUser: (userId) =>
    set({ userId, status: userId ? 'authenticated' : 'anonymous' }),
}))
```

```ts
// src/features/auth/initAuth.ts
import { getCurrentUserId, onAuthChange } from '../../lib/authClient'
import { useAuthStore } from './authStore'

// Appelé une fois au démarrage (main.tsx). Hydrate le store depuis la session
// Supabase puis reste synchronisé. Retourne un désabonnement.
export async function initAuth(): Promise<() => void> {
  const userId = await getCurrentUserId()
  useAuthStore.getState().setUser(userId)
  return onAuthChange((id) => useAuthStore.getState().setUser(id))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/features/auth/authStore.test.ts src/features/auth/initAuth.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npx prettier --write src/features && npm run test`
Expected: tout vert.

```bash
git add src/features/auth/authStore.ts src/features/auth/authStore.test.ts src/features/auth/initAuth.ts src/features/auth/initAuth.test.ts
git commit -m "feat(auth): store d'auth Zustand et synchronisation initAuth"
```

---

### Task 5: AuthPanel — UI inscription / connexion / déconnexion

**Files:**
- Create: `src/features/auth/AuthPanel.tsx`
- Test: `src/features/auth/AuthPanel.test.tsx`
- Modify: `src/i18n/locales/fr.json` (ajout des clés `auth.*`)

**Interfaces:**
- Consumes: `signIn`, `signOut`, `signUp` de `../../lib/authClient` ; `useAuthStore` (Task 4) ; clés i18n `auth.*`.
- Produces: `AuthPanel({ onSignedUp }: { onSignedUp?: (userId: string) => void })` — si connecté : affiche l'état + bouton déconnexion. Sinon : formulaire email/mot de passe avec bascule inscription/connexion. `onSignedUp` est appelé uniquement après une **inscription** réussie (déclencheur de la migration d'XP).

- [ ] **Step 1: Add i18n keys to fr.json (ajout du bloc `auth`)**

Ajouter la clé `"auth"` au même niveau que `"app"` et `"drill"` :

```json
  "auth": {
    "signupTab": "Créer un compte",
    "loginTab": "Se connecter",
    "email": "Adresse e-mail",
    "password": "Mot de passe",
    "submitSignup": "Créer mon compte",
    "submitLogin": "Connexion",
    "logout": "Se déconnecter",
    "loggedIn": "Connecté",
    "genericError": "Une erreur est survenue. Réessaie."
  }
```

- [ ] **Step 2: Write the failing tests**

```tsx
// src/features/auth/AuthPanel.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import * as authClient from '../../lib/authClient'
import { useAuthStore } from './authStore'
import { AuthPanel } from './AuthPanel'

vi.mock('../../lib/authClient')

beforeEach(() => {
  useAuthStore.setState({ userId: null, status: 'anonymous' })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AuthPanel — déconnecté', () => {
  test('inscription : appelle signUp puis onSignedUp', async () => {
    vi.mocked(authClient.signUp).mockResolvedValue({
      userId: 'u1',
      needsConfirmation: false,
    })
    const onSignedUp = vi.fn()
    render(<AuthPanel onSignedUp={onSignedUp} />)
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'a@b.fr' },
    })
    fireEvent.change(screen.getByLabelText('Mot de passe'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))
    await waitFor(() => expect(authClient.signUp).toHaveBeenCalledWith('a@b.fr', 'secret123'))
    await waitFor(() => expect(onSignedUp).toHaveBeenCalledWith('u1'))
  })

  test('bascule vers connexion : appelle signIn, pas onSignedUp', async () => {
    vi.mocked(authClient.signIn).mockResolvedValue({ userId: 'u2' })
    const onSignedUp = vi.fn()
    render(<AuthPanel onSignedUp={onSignedUp} />)
    fireEvent.click(screen.getByRole('tab', { name: 'Se connecter' }))
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'a@b.fr' },
    })
    fireEvent.change(screen.getByLabelText('Mot de passe'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Connexion' }))
    await waitFor(() => expect(authClient.signIn).toHaveBeenCalledWith('a@b.fr', 'secret123'))
    expect(onSignedUp).not.toHaveBeenCalled()
  })

  test('affiche un message d’erreur si signUp échoue', async () => {
    vi.mocked(authClient.signUp).mockRejectedValue(new Error('boom'))
    render(<AuthPanel />)
    fireEvent.change(screen.getByLabelText('Adresse e-mail'), {
      target: { value: 'a@b.fr' },
    })
    fireEvent.change(screen.getByLabelText('Mot de passe'), {
      target: { value: 'secret123' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Créer mon compte' }))
    await waitFor(() =>
      expect(
        screen.getByText('Une erreur est survenue. Réessaie.'),
      ).toBeInTheDocument(),
    )
  })
})

describe('AuthPanel — connecté', () => {
  test('affiche l’état connecté et déconnecte', async () => {
    useAuthStore.setState({ userId: 'u1', status: 'authenticated' })
    vi.mocked(authClient.signOut).mockResolvedValue()
    render(<AuthPanel />)
    expect(screen.getByText('Connecté')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Se déconnecter' }))
    await waitFor(() => expect(authClient.signOut).toHaveBeenCalled())
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npx vitest run src/features/auth/AuthPanel.test.tsx`
Expected: FAIL — `Failed to resolve import "./AuthPanel"`.

- [ ] **Step 4: Write the implementation**

```tsx
// src/features/auth/AuthPanel.tsx
import { useState, type FormEvent } from 'react'
import { useTranslation } from 'react-i18next'
import { signIn, signOut, signUp } from '../../lib/authClient'
import { useAuthStore } from './authStore'

type Mode = 'signup' | 'login'

export function AuthPanel({ onSignedUp }: { onSignedUp?: (userId: string) => void }) {
  const { t } = useTranslation()
  const status = useAuthStore((state) => state.status)
  const [mode, setMode] = useState<Mode>('signup')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(false)

  if (status === 'authenticated') {
    return (
      <section aria-label={t('auth.loggedIn')}>
        <span>{t('auth.loggedIn')}</span>
        <button type="button" onClick={() => void signOut()}>
          {t('auth.logout')}
        </button>
      </section>
    )
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(false)
    try {
      if (mode === 'signup') {
        const { userId } = await signUp(email, password)
        onSignedUp?.(userId)
      } else {
        await signIn(email, password)
      }
    } catch {
      setError(true)
    }
  }

  return (
    <section>
      <div role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'signup'}
          onClick={() => setMode('signup')}
        >
          {t('auth.signupTab')}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'login'}
          onClick={() => setMode('login')}
        >
          {t('auth.loginTab')}
        </button>
      </div>
      <form onSubmit={handleSubmit}>
        <label>
          {t('auth.email')}
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
        <label>
          {t('auth.password')}
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>
        <button type="submit">
          {t(mode === 'signup' ? 'auth.submitSignup' : 'auth.submitLogin')}
        </button>
      </form>
      {error && <p role="alert">{t('auth.genericError')}</p>}
    </section>
  )
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run src/features/auth/AuthPanel.test.tsx`
Expected: PASS.

- [ ] **Step 6: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npx prettier --write src/features src/i18n && npm run test`
Expected: tout vert.

```bash
git add src/features/auth/AuthPanel.tsx src/features/auth/AuthPanel.test.tsx src/i18n/locales/fr.json
git commit -m "feat(auth): AuthPanel (inscription/connexion/déconnexion) + i18n"
```

---

### Task 6: profileApi — RPC profil / session / migration

**Files:**
- Create: `src/lib/profileApi.ts`
- Test: `src/lib/profileApi.test.ts`

**Interfaces:**
- Consumes: `getSupabase` de `./supabase`.
- Produces: `interface ServerProfile { xpTotal: number; level: number; currentStreak: number; longestStreak: number }` ; `interface RecordSessionInput { tier: number; correct: boolean; accuracy: number; cardsSeen: number; durationMs: number; xpEarned: number; difficulty: Record<string, unknown> }` ; `fetchProfile(): Promise<ServerProfile>` ; `recordDrillSession(input: RecordSessionInput): Promise<ServerProfile>` ; `migrateAnonymousProgress(anonXp: number): Promise<ServerProfile>`. Chaque fonction appelle une RPC et mappe le json `{ xp_total, level, current_streak, longest_streak }` vers `ServerProfile`.

- [ ] **Step 1: Write the failing tests**

```ts
// src/lib/profileApi.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  fetchProfile,
  migrateAnonymousProgress,
  recordDrillSession,
} from './profileApi'
import { getSupabase } from './supabase'

vi.mock('./supabase', () => ({ getSupabase: vi.fn() }))

const rpcJson = {
  xp_total: 42,
  level: 2,
  current_streak: 3,
  longest_streak: 5,
}

afterEach(() => {
  vi.clearAllMocks()
})

describe('fetchProfile', () => {
  test('appelle get_profile et mappe vers ServerProfile', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rpcJson, error: null })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    await expect(fetchProfile()).resolves.toEqual({
      xpTotal: 42,
      level: 2,
      currentStreak: 3,
      longestStreak: 5,
    })
    expect(rpc).toHaveBeenCalledWith('get_profile', undefined)
  })

  test('propage l’erreur RPC', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'rls' } })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    await expect(fetchProfile()).rejects.toThrow('rls')
  })
})

describe('recordDrillSession', () => {
  test('appelle record_drill_session avec les paramètres snake_case', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rpcJson, error: null })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    const result = await recordDrillSession({
      tier: 1,
      correct: true,
      accuracy: 1,
      cardsSeen: 20,
      durationMs: 24000,
      xpEarned: 10,
      difficulty: { tier: 1, speedMs: 1200 },
    })
    expect(result).toEqual({
      xpTotal: 42,
      level: 2,
      currentStreak: 3,
      longestStreak: 5,
    })
    expect(rpc).toHaveBeenCalledWith('record_drill_session', {
      p_tier: 1,
      p_correct: true,
      p_accuracy: 1,
      p_cards_seen: 20,
      p_duration_ms: 24000,
      p_xp_earned: 10,
      p_difficulty: { tier: 1, speedMs: 1200 },
    })
  })
})

describe('migrateAnonymousProgress', () => {
  test('appelle migrate_anonymous_progress avec p_xp', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: rpcJson, error: null })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    await migrateAnonymousProgress(120)
    expect(rpc).toHaveBeenCalledWith('migrate_anonymous_progress', { p_xp: 120 })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/profileApi.test.ts`
Expected: FAIL — `Failed to resolve import "./profileApi"`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/profileApi.ts
import { getSupabase } from './supabase'

export interface ServerProfile {
  readonly xpTotal: number
  readonly level: number
  readonly currentStreak: number
  readonly longestStreak: number
}

export interface RecordSessionInput {
  readonly tier: number
  readonly correct: boolean
  readonly accuracy: number
  readonly cardsSeen: number
  readonly durationMs: number
  readonly xpEarned: number
  readonly difficulty: Record<string, unknown>
}

interface ProfileJson {
  xp_total: number
  level: number
  current_streak: number
  longest_streak: number
}

const toServerProfile = (json: ProfileJson): ServerProfile => ({
  xpTotal: json.xp_total,
  level: json.level,
  currentStreak: json.current_streak,
  longestStreak: json.longest_streak,
})

async function callRpc(
  name: string,
  args?: Record<string, unknown>,
): Promise<ServerProfile> {
  const { data, error } = await getSupabase().rpc(name, args)
  if (error) {
    throw new Error(error.message)
  }
  return toServerProfile(data as ProfileJson)
}

export function fetchProfile(): Promise<ServerProfile> {
  return callRpc('get_profile')
}

export function recordDrillSession(input: RecordSessionInput): Promise<ServerProfile> {
  return callRpc('record_drill_session', {
    p_tier: input.tier,
    p_correct: input.correct,
    p_accuracy: input.accuracy,
    p_cards_seen: input.cardsSeen,
    p_duration_ms: input.durationMs,
    p_xp_earned: input.xpEarned,
    p_difficulty: input.difficulty,
  })
}

export function migrateAnonymousProgress(anonXp: number): Promise<ServerProfile> {
  return callRpc('migrate_anonymous_progress', { p_xp: anonXp })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/profileApi.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npx prettier --write src/lib && npm run test`
Expected: tout vert.

```bash
git add src/lib/profileApi.ts src/lib/profileApi.test.ts
git commit -m "feat(profile): couche profileApi (get_profile/record_drill_session/migration)"
```

---

### Task 7: serverProfileStore + câblage DrillScreen/App

**Files:**
- Create: `src/features/drill/serverProfileStore.ts`
- Test: `src/features/drill/serverProfileStore.test.ts`
- Modify: `src/features/drill/DrillScreen.tsx`
- Modify: `src/features/drill/DrillScreen.test.tsx`
- Modify: `src/App.tsx`
- Modify: `src/App.test.tsx`
- Modify: `src/main.tsx`
- Modify: `src/i18n/locales/fr.json`

**Interfaces:**
- Consumes: `ServerProfile`, `fetchProfile`, `migrateAnonymousProgress`, `recordDrillSession` de `../../lib/profileApi` ; `useAuthStore` de `../auth/authStore` ; `useProfileStore` (local, Phase 2) ; engine `computeXp`/`levelFromXp`.
- Produces: `useServerProfileStore` avec `{ profile: ServerProfile | null; setProfile: (p: ServerProfile | null) => void }`. `DrillScreen` : si `status === 'authenticated'`, l'en-tête affiche le profil serveur et la fin de session appelle `recordDrillSession` ; sinon comportement Phase 2 (local). `App` : héberge `AuthPanel` et déclenche `migrateAnonymousProgress(localXp)` puis vide le store local à l'inscription.

- [ ] **Step 1: Write the failing store test**

```ts
// src/features/drill/serverProfileStore.test.ts
import { beforeEach, describe, expect, test } from 'vitest'
import { useServerProfileStore } from './serverProfileStore'

describe('useServerProfileStore', () => {
  beforeEach(() => {
    useServerProfileStore.setState({ profile: null })
  })

  test('état initial : profil null', () => {
    expect(useServerProfileStore.getState().profile).toBeNull()
  })

  test('setProfile enregistre le profil serveur', () => {
    useServerProfileStore.getState().setProfile({
      xpTotal: 30,
      level: 1,
      currentStreak: 2,
      longestStreak: 4,
    })
    expect(useServerProfileStore.getState().profile).toEqual({
      xpTotal: 30,
      level: 1,
      currentStreak: 2,
      longestStreak: 4,
    })
  })
})
```

- [ ] **Step 2: Run it (fails), then implement the store**

Run: `npx vitest run src/features/drill/serverProfileStore.test.ts`
Expected: FAIL — import non résolu.

```ts
// src/features/drill/serverProfileStore.ts
import { create } from 'zustand'
import type { ServerProfile } from '../../lib/profileApi'

export interface ServerProfileState {
  readonly profile: ServerProfile | null
  setProfile: (profile: ServerProfile | null) => void
}

export const useServerProfileStore = create<ServerProfileState>((set) => ({
  profile: null,
  setProfile: (profile) => set({ profile }),
}))
```

Run again: `npx vitest run src/features/drill/serverProfileStore.test.ts` → PASS.

- [ ] **Step 3: Add i18n key for streak (fr.json, dans le bloc `drill`)**

Ajouter au bloc `drill` :

```json
    "streak": "Série : {{days}} j"
```

- [ ] **Step 4: Write the failing DrillScreen integration tests**

Ajouter en tête de `src/features/drill/DrillScreen.test.tsx` les imports et mocks :

```tsx
import { useAuthStore } from '../auth/authStore'
import { useServerProfileStore } from './serverProfileStore'
import * as profileApi from '../../lib/profileApi'

vi.mock('../../lib/profileApi')
```

Compléter le `beforeEach` existant pour réinitialiser l'auth en anonyme par défaut :

```tsx
    useAuthStore.setState({ userId: null, status: 'anonymous' })
    useServerProfileStore.setState({ profile: null })
```

Puis ajouter ce bloc de tests à la fin du fichier :

```tsx
describe('DrillScreen — connecté', () => {
  beforeEach(() => {
    useAuthStore.setState({ userId: 'u1', status: 'authenticated' })
    useServerProfileStore.setState({
      profile: { xpTotal: 200, level: 2, currentStreak: 4, longestStreak: 6 },
    })
  })

  test('affiche les stats serveur (niveau, XP, streak)', () => {
    render(<DrillScreen />)
    expect(screen.getByText('Niveau 2')).toBeInTheDocument()
    expect(screen.getByText('200 XP')).toBeInTheDocument()
    expect(screen.getByText('Série : 4 j')).toBeInTheDocument()
  })

  test('fin de session : appelle recordDrillSession et met à jour le profil serveur', async () => {
    vi.mocked(profileApi.recordDrillSession).mockResolvedValue({
      xpTotal: 210,
      level: 2,
      currentStreak: 5,
      longestStreak: 6,
    })
    render(<DrillScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la session' }))
    act(() => {
      vi.advanceTimersByTime(1200 * 20)
    })
    fireEvent.change(screen.getByLabelText('Quel est le running count final ?'), {
      target: { value: '999' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Valider' }))
    await vi.waitFor(() =>
      expect(profileApi.recordDrillSession).toHaveBeenCalledWith(
        expect.objectContaining({ tier: 1, correct: false }),
      ),
    )
    // le store local n'est pas touché quand on est connecté
    expect(useProfileStore.getState().xpTotal).toBe(0)
  })
})
```

Note : le test anonyme existant (« affiche niveau et XP totale du profil ») reste valide
car son `beforeEach` remet `status: 'anonymous'` et lit le store local.

- [ ] **Step 5: Run to verify the new tests fail**

Run: `npx vitest run src/features/drill/DrillScreen.test.tsx`
Expected: FAIL — les stats serveur ne sont pas encore branchées.

- [ ] **Step 6: Modify DrillScreen to branch on auth status**

Remplacer le contenu de `src/features/drill/DrillScreen.tsx` par :

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { computeXp, currentCard, getTierConfig, levelFromXp } from '../../engine'
import { recordDrillSession } from '../../lib/profileApi'
import { useAuthStore } from '../auth/authStore'
import { CardView } from './CardView'
import { CountInput } from './CountInput'
import { useDrillSession } from './useDrillSession'
import { useProfileStore } from './profileStore'
import { useServerProfileStore } from './serverProfileStore'
import { ReplayPanel } from './ReplayPanel'
import { ResultsPanel } from './ResultsPanel'
import { TierPicker } from './TierPicker'

export function DrillScreen() {
  const { t } = useTranslation()
  const [selectedTier, setSelectedTier] = useState(1)
  const [xpEarned, setXpEarned] = useState(0)
  const { session, result, start, submitCheckpoint, submitFinal, reset } =
    useDrillSession()

  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated')
  const localXpTotal = useProfileStore((state) => state.xpTotal)
  const recordLocalSession = useProfileStore((state) => state.recordSession)
  const serverProfile = useServerProfileStore((state) => state.profile)
  const setServerProfile = useServerProfileStore((state) => state.setProfile)

  const displayedXp = isAuthenticated ? (serverProfile?.xpTotal ?? 0) : localXpTotal
  const displayedLevel = isAuthenticated
    ? (serverProfile?.level ?? 1)
    : levelFromXp(localXpTotal)

  const handleFinal = (given: number) => {
    if (!session) {
      return
    }
    const sessionResult = submitFinal(given)
    if (!sessionResult) {
      return
    }
    const xp = computeXp({
      xpBase: session.config.xpBase,
      correct: sessionResult.correct,
      accuracy: sessionResult.accuracy,
      streakActive: false,
    })
    setXpEarned(xp)
    if (isAuthenticated) {
      void recordDrillSession({
        tier: session.config.tier,
        correct: sessionResult.correct,
        accuracy: sessionResult.accuracy,
        cardsSeen: sessionResult.cardsSeen,
        durationMs: sessionResult.cardsSeen * session.config.speedMs,
        xpEarned: xp,
        difficulty: {
          tier: session.config.tier,
          speedMs: session.config.speedMs,
          deckCount: session.config.deckCount,
          cardsCount: session.config.cardsCount,
        },
      }).then(setServerProfile)
    } else {
      recordLocalSession({
        tier: session.config.tier,
        correct: sessionResult.correct,
        xpEarned: xp,
      })
    }
  }

  return (
    <main>
      <header>
        <p>{t('drill.level', { level: displayedLevel })}</p>
        <p>{t('drill.xpTotal', { xp: displayedXp })}</p>
        {isAuthenticated && serverProfile && (
          <p>{t('drill.streak', { days: serverProfile.currentStreak })}</p>
        )}
      </header>

      {result && session ? (
        <>
          <ResultsPanel result={result} xpEarned={xpEarned} />
          <ReplayPanel cards={session.cards} />
          <button type="button" onClick={reset}>
            {t('drill.newSession')}
          </button>
        </>
      ) : !session ? (
        <>
          <TierPicker selected={selectedTier} onSelect={setSelectedTier} />
          <button type="button" onClick={() => start(getTierConfig(selectedTier))}>
            {t('drill.start')}
          </button>
        </>
      ) : session.phase === 'awaiting-checkpoint' ? (
        <CountInput label={t('drill.checkpointPrompt')} onSubmit={submitCheckpoint} />
      ) : session.phase === 'awaiting-final' ? (
        <CountInput label={t('drill.finalPrompt')} onSubmit={handleFinal} />
      ) : (
        <>
          {session.position > 0 && <CardView card={currentCard(session)} />}
          <p>
            {t('drill.progress', {
              current: session.position,
              total: session.cards.length,
            })}
          </p>
        </>
      )}
    </main>
  )
}
```

- [ ] **Step 7: Wire AuthPanel + migration into App**

Remplacer `src/App.tsx` par :

```tsx
import { useTranslation } from 'react-i18next'
import { migrateAnonymousProgress } from './lib/profileApi'
import { AuthPanel } from './features/auth/AuthPanel'
import { DrillScreen } from './features/drill/DrillScreen'
import { useProfileStore } from './features/drill/profileStore'
import { useServerProfileStore } from './features/drill/serverProfileStore'

function App() {
  const { t } = useTranslation()

  const handleSignedUp = () => {
    const anonXp = useProfileStore.getState().xpTotal
    void migrateAnonymousProgress(anonXp).then((profile) => {
      useServerProfileStore.getState().setProfile(profile)
      useProfileStore.setState({ xpTotal: 0, successesByTier: {} })
    })
  }

  return (
    <>
      <h1>{t('app.title')}</h1>
      <AuthPanel onSignedUp={handleSignedUp} />
      <DrillScreen />
    </>
  )
}

export default App
```

Mettre à jour `src/App.test.tsx` pour neutraliser les dépendances réseau :

```tsx
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, test, vi } from 'vitest'
import App from './App'
import { useAuthStore } from './features/auth/authStore'

vi.mock('./lib/profileApi')
vi.mock('./lib/authClient')

describe('App', () => {
  beforeEach(() => {
    useAuthStore.setState({ userId: null, status: 'anonymous' })
  })

  test('affiche le titre, l’auth et l’écran de drill', () => {
    render(<App />)
    expect(
      screen.getByRole('heading', { level: 1, name: 'CardCount' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Créer mon compte' }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Lancer la session' }),
    ).toBeInTheDocument()
  })
})
```

- [ ] **Step 8: Wire initAuth into main.tsx**

Remplacer `src/main.tsx` par :

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { initAuth } from './features/auth/initAuth'
import './i18n'

void initAuth()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
```

- [ ] **Step 9: Run the full suite**

Run: `npm run test`
Expected: PASS — anciens tests Phase 2 (anonymes) + nouveaux tests connectés.

- [ ] **Step 10: Verify quality gates and commit**

Run: `npm run lint && npm run typecheck && npx prettier --write src && npm run format:check && npm run test`
Expected: tout vert.

```bash
git add src/features/drill/serverProfileStore.ts src/features/drill/serverProfileStore.test.ts src/features/drill/DrillScreen.tsx src/features/drill/DrillScreen.test.tsx src/App.tsx src/App.test.tsx src/main.tsx src/i18n/locales/fr.json
git commit -m "feat(profile): profil serveur, sauvegarde de session et migration à l'inscription"
```

---

### Task 8: Clôture — couverture, build, push, 🧑 application des migrations et vérification en ligne

**Files:**
- Aucun nouveau fichier (corrections de couverture éventuelles).

- [ ] **Step 1: Coverage**

Run: `npm run test:coverage`
Expected: PASS — global ≥ 80 % (seuil bloquant), `src/engine/**` = 100 %. Si un fichier client fait chuter le global, ajouter le test manquant (ne jamais abaisser le seuil).

- [ ] **Step 2: Full gates**

Run: `npm run lint && npm run typecheck && npm run format:check && npm run test && npm run build`
Expected: tout vert.

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Verify CI**

Vérifier `https://api.github.com/repos/mathis1812/-cardcount-/actions/runs?per_page=1` :
`"status": "completed", "conclusion": "success"`.

- [ ] **Step 5: 🧑 Apply migrations to Supabase**

Suivre `supabase/README.md` : appliquer `0001` puis `0002` dans le SQL editor du projet
Supabase, et désactiver la confirmation d'e-mail (Auth → Providers → Email) pour le MVP.

- [ ] **Step 6: 🧑 Verify online (critère de sortie)**

Sur `https://cardcountj.netlify.app` : créer un compte, jouer une session (elle doit
être sauvegardée : l'XP serveur augmente et persiste après rechargement + reconnexion),
rejouer le lendemain (ou vérifier la ligne `streaks`) pour confirmer l'incrément de streak.
Vérifier dans Supabase : une ligne dans `drill_sessions`, `profiles.xp_total` à jour,
`streaks.current_streak` ≥ 1.

---

## Vérification de fin de phase

1. Gates locaux verts (lint, typecheck, format, tests, coverage ≥ 80 %, build).
2. CI GitHub Actions verte sur `main`.
3. Migrations `0001` + `0002` appliquées sur Supabase (RLS activé, 6 fonctions présentes).
4. Compte créable ; session sauvegardée côté serveur (`drill_sessions` + `profiles.xp_total`) ;
   streak incrémentée via `record_activity`.
5. Migration de l'XP anonyme : à la première inscription, l'XP locale (plafonnée à 500)
   passe sur le profil serveur puis le store local est vidé.
6. Aucune écriture directe possible depuis le client (policies SELECT-only ; écritures via RPC).
7. Zéro secret dans le bundle ; zéro texte en dur.
