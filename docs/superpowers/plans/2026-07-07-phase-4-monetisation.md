# Phase 4 — Monétisation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freemium par quota (3 sessions/jour gratuites, configurable en base), abonnement Stripe (mensuel + annuel) via 3 Netlify Functions, paywall et portail client, statut premium. Critère : paiement test Stripe de bout en bout.

**Architecture:** Le quota et le statut d'abonnement sont décidés côté serveur (fonctions Postgres `SECURITY DEFINER`). Stripe est la seule logique serveur d'écriture d'abonnement : trois Netlify Functions (`stripe-checkout`, `stripe-webhook`, `stripe-portal`) tournent en Node avec la clé secrète Stripe et le service_role Supabase (secrets en env Netlify, jamais dans le bundle client). Le webhook est la source de vérité de la table `subscriptions`, traité de façon idempotente. Le client appelle une RPC de quota avant chaque session ; un refus typé ouvre le paywall.

**Tech Stack:** Supabase (Postgres, RLS, plpgsql), Stripe SDK Node, Netlify Functions (`@netlify/functions`, style handler), React 19 + Zustand + react-i18next, Vitest + RTL (Stripe/Supabase/fetch mockés).

## Global Constraints

- Freemium : 3 sessions/jour gratuites, **valeur configurable en base** (`app_config.free_daily_limit`), illimité pour les abonnés (spec §2).
- Prix : deux prix Stripe, mensuel ~7-10 € + annuel réduit (~-40 %) (spec §2). Les `price_id` vivent en env, jamais en dur.
- Quotas appliqués **côté serveur** : `start_drill_session()` refuse au-delà du quota si non-abonné ; le client affiche, le serveur décide (spec §3).
- Stripe = seule logique serveur : le **webhook** écrit `subscriptions` (service_role) ; jamais de statut d'abonnement décidé côté client (spec §3, §6).
- Webhook : **idempotent** (traitement par event id), **signature vérifiée**, réponse 200 uniquement après écriture en base (spec §6).
- Refus de quota : erreur **typée** → écran paywall, pas de message technique (spec §6).
- Sécurité : côté client uniquement l'anon key Supabase ; secrets (Stripe secret, webhook secret, service_role) en env vars Netlify (spec §3). RLS sur toutes les tables ; `subscriptions` en lecture seule utilisateur, écriture service_role (spec §4).
- Zéro texte en dur (i18n) ; immutabilité ; conventional commits ; un commit par tâche ; `npm run lint && npm run typecheck && npm run test` avant chaque commit.
- Seuils de couverture bloquants : global (scope `src/**`) ≥ 80 %, `src/engine/**` = 100 %. Les Netlify Functions vivent hors `src/` : hors périmètre de couverture, mais **testées** (correction vérifiée par tests unitaires mockés).
- Migrations SQL et configuration Stripe/Netlify (clés, webhook, prix) = **étapes humaines** marquées 🧑.

## Note d'architecture

- **Netlify Functions** en style handler AWS/Netlify (`export const handler: Handler`) — bien typé via `@netlify/functions`, testable en appelant `handler(event)` directement. Chemin par défaut : `/.netlify/functions/<nom>`.
- **Auth des functions** : le client envoie son access_token Supabase en `Authorization: Bearer <token>`. La function crée un client Supabase (anon key + token) et appelle `auth.getUser()` pour obtenir l'`user.id`, puis écrit avec le client service_role.
- **Client customer Stripe** : `stripe-checkout` récupère/crée le customer et stocke `stripe_customer_id` dans `subscriptions` (statut `incomplete`) ; le webhook complète `status`/`plan`/`current_period_end`.
- **Statut premium** : nouvelle RPC `get_subscription_status()` (n'altère pas `get_profile` de la Phase 3, évite de casser les tests existants).

## File Structure

```
supabase/migrations/
└── 0003_billing_quotas.sql        — app_config, daily_usage, subscriptions, stripe_events,
                                      is_premium, start_drill_session, get_subscription_status
netlify/functions/
├── _shared/
│   ├── supabaseAdmin.ts           — client service_role (env) — fabrique
│   ├── auth.ts                    — userIdFromEvent(event) via Bearer token
│   ├── stripeStatus.ts            — mapStripeStatus + planFromPriceId (pur, testé)
│   ├── stripeStatus.test.ts
│   ├── subscriptionUpsert.ts      — applyStripeEvent(event, deps) (pur/injecté, testé)
│   └── subscriptionUpsert.test.ts
├── stripe-checkout.ts             — handler : crée une Checkout Session
├── stripe-checkout.test.ts
├── stripe-webhook.ts              — handler : vérifie signature, idempotent, upsert
├── stripe-webhook.test.ts
├── stripe-portal.ts               — handler : crée une session de portail client
└── stripe-portal.test.ts
src/lib/
├── billingApi.ts                  — startDrillSession, fetchSubscriptionStatus, startCheckout, openBillingPortal
└── billingApi.test.ts
src/features/billing/
├── subscriptionStore.ts           — Zustand : isPremium, plan
├── subscriptionStore.test.ts
├── PaywallPanel.tsx               — pricing (mensuel/annuel) + boutons abonnement/portail
└── PaywallPanel.test.tsx
src/features/drill/
└── DrillScreen.tsx (modifié)      — gate quota avant start ; paywall si refus ; badge premium
src/App.tsx (modifié)             — charge le statut d'abonnement à la connexion
netlify.toml (modifié)            — [functions] directory + bundler
tsconfig.functions.json (créé)     — typecheck des functions
package.json (modifié)            — deps stripe + @netlify/functions ; typecheck inclut functions
```

---

### Task 1: 🧑 Migration SQL — quotas, abonnements, statut premium

**Files:**
- Create: `supabase/migrations/0003_billing_quotas.sql`
- Modify: `supabase/README.md` (ajouter l'application de 0003 + les env Stripe)

**Interfaces:**
- Consumes: tables Phase 3 (`profiles`, `streaks`).
- Produces: tables `app_config`, `daily_usage`, `subscriptions`, `stripe_events` ; RPC `start_drill_session() → json { remaining }` (lève `quota_exceeded`), `get_subscription_status() → json { is_premium, plan }` ; fonction `is_premium(uuid) → boolean`.

Pas de test automatisé (pas de Postgres local) : vérification manuelle dans Supabase (Task 10). DDL uniquement, aucun secret.

- [ ] **Step 1: Write the migration file**

```sql
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
```

- [ ] **Step 2: Update supabase/README.md**

Ajouter, après l'application de `0002`, une étape « 3. Coller `migrations/0003_billing_quotas.sql`, exécuter. » et une section :

```markdown
## Variables d'environnement Netlify (Phase 4 — Stripe)

Secrets serveur (jamais préfixés `VITE_`, jamais dans le bundle) :

- `STRIPE_SECRET_KEY` (clé test `sk_test_…`)
- `STRIPE_WEBHOOK_SECRET` (`whsec_…`, donné par Stripe à la création du webhook)
- `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` (id des prix Stripe `price_…`)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API)

Webhook Stripe : endpoint `https://<site>.netlify.app/.netlify/functions/stripe-webhook`,
événements `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`.
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0003_billing_quotas.sql supabase/README.md
git commit -m "feat(db): quotas freemium, tables Stripe, is_premium, start_drill_session"
```

---

### Task 2: Setup Netlify Functions — deps, config, helpers partagés

**Files:**
- Modify: `package.json` (deps `stripe`, `@netlify/functions` ; script `typecheck`)
- Modify: `netlify.toml`
- Create: `tsconfig.functions.json`
- Create: `netlify/functions/_shared/stripeStatus.ts`
- Test: `netlify/functions/_shared/stripeStatus.test.ts`

**Interfaces:**
- Consumes: rien.
- Produces: `type SubStatus = 'incomplete' | 'active' | 'trialing' | 'past_due' | 'canceled'` ; `mapStripeStatus(stripeStatus: string): SubStatus` ; `planFromPriceId(priceId: string, monthlyId: string, yearlyId: string): 'monthly' | 'yearly' | null`.

- [ ] **Step 1: Install dependencies**

Run: `npm install stripe && npm install -D @netlify/functions`
Expected: ajouts sans erreur.

- [ ] **Step 2: Configure Netlify functions in netlify.toml**

Ajouter à `netlify.toml` :

```toml
[functions]
  directory = "netlify/functions"
  node_bundler = "esbuild"
```

- [ ] **Step 3: Create tsconfig.functions.json and extend typecheck**

```json
// tsconfig.functions.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "types": ["node"],
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["netlify/functions"]
}
```

Dans `package.json`, remplacer le script `typecheck` par :

```json
    "typecheck": "tsc -b --noEmit && tsc -p tsconfig.functions.json --noEmit",
```

- [ ] **Step 4: Write the failing test**

```ts
// netlify/functions/_shared/stripeStatus.test.ts
import { describe, expect, test } from 'vitest'
import { mapStripeStatus, planFromPriceId } from './stripeStatus'

describe('mapStripeStatus', () => {
  test.each([
    ['active', 'active'],
    ['trialing', 'trialing'],
    ['past_due', 'past_due'],
    ['canceled', 'canceled'],
    ['incomplete', 'incomplete'],
    ['unpaid', 'past_due'],
    ['incomplete_expired', 'canceled'],
    ['n_importe_quoi', 'incomplete'],
  ])('%s → %s', (input, expected) => {
    expect(mapStripeStatus(input)).toBe(expected)
  })
})

describe('planFromPriceId', () => {
  test('reconnaît mensuel et annuel, sinon null', () => {
    expect(planFromPriceId('price_m', 'price_m', 'price_y')).toBe('monthly')
    expect(planFromPriceId('price_y', 'price_m', 'price_y')).toBe('yearly')
    expect(planFromPriceId('price_x', 'price_m', 'price_y')).toBeNull()
  })
})
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npx vitest run netlify/functions/_shared/stripeStatus.test.ts`
Expected: FAIL — import non résolu.

- [ ] **Step 6: Write the implementation**

```ts
// netlify/functions/_shared/stripeStatus.ts
export type SubStatus = 'incomplete' | 'active' | 'trialing' | 'past_due' | 'canceled'

const STATUS_MAP: Record<string, SubStatus> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  unpaid: 'past_due',
  canceled: 'canceled',
  incomplete_expired: 'canceled',
  incomplete: 'incomplete',
}

export function mapStripeStatus(stripeStatus: string): SubStatus {
  return STATUS_MAP[stripeStatus] ?? 'incomplete'
}

export function planFromPriceId(
  priceId: string,
  monthlyId: string,
  yearlyId: string,
): 'monthly' | 'yearly' | null {
  if (priceId === monthlyId) {
    return 'monthly'
  }
  if (priceId === yearlyId) {
    return 'yearly'
  }
  return null
}
```

- [ ] **Step 7: Run test, typecheck, format, commit**

Run: `npx vitest run netlify/functions/_shared/stripeStatus.test.ts && npm run typecheck && npx prettier --write netlify package.json tsconfig.functions.json netlify.toml && npm run lint && npm run test`
Expected: tout vert.

```bash
git add package.json package-lock.json netlify.toml tsconfig.functions.json netlify/functions/_shared/stripeStatus.ts netlify/functions/_shared/stripeStatus.test.ts
git commit -m "chore(functions): setup Netlify Functions + helpers de statut Stripe"
```

---

### Task 3: Helper d'upsert d'abonnement (logique webhook pure)

**Files:**
- Create: `netlify/functions/_shared/subscriptionUpsert.ts`
- Test: `netlify/functions/_shared/subscriptionUpsert.test.ts`

**Interfaces:**
- Consumes: `mapStripeStatus`, `planFromPriceId`, `SubStatus` de `./stripeStatus`.
- Produces: `interface StripeEventLike { id: string; type: string; data: { object: Record<string, unknown> } }` ; `interface SubscriptionRow { stripe_customer_id: string; stripe_sub_id: string | null; status: SubStatus; plan: 'monthly' | 'yearly' | null; current_period_end: string | null }` ; `interface UpsertDeps { monthlyPriceId: string; yearlyPriceId: string; upsertSubscription: (row: SubscriptionRow) => Promise<void>; markProcessed: (eventId: string) => Promise<boolean> }` ; `applyStripeEvent(event: StripeEventLike, deps: UpsertDeps): Promise<{ handled: boolean }>`. `markProcessed` renvoie `false` si l'event a déjà été traité (idempotence).

- [ ] **Step 1: Write the failing tests**

```ts
// netlify/functions/_shared/subscriptionUpsert.test.ts
import { describe, expect, test, vi } from 'vitest'
import { applyStripeEvent } from './subscriptionUpsert'

const deps = (already = false) => ({
  monthlyPriceId: 'price_m',
  yearlyPriceId: 'price_y',
  upsertSubscription: vi.fn().mockResolvedValue(undefined),
  markProcessed: vi.fn().mockResolvedValue(!already),
})

describe('applyStripeEvent', () => {
  test('event déjà traité : idempotent, aucun upsert', async () => {
    const d = deps(true)
    const result = await applyStripeEvent(
      { id: 'evt_1', type: 'customer.subscription.updated', data: { object: {} } },
      d,
    )
    expect(result.handled).toBe(false)
    expect(d.upsertSubscription).not.toHaveBeenCalled()
  })

  test('subscription.updated : mappe statut, plan et période', async () => {
    const d = deps()
    await applyStripeEvent(
      {
        id: 'evt_2',
        type: 'customer.subscription.updated',
        data: {
          object: {
            customer: 'cus_1',
            id: 'sub_1',
            status: 'active',
            current_period_end: 1_800_000_000,
            items: { data: [{ price: { id: 'price_y' } }] },
          },
        },
      },
      d,
    )
    expect(d.upsertSubscription).toHaveBeenCalledWith({
      stripe_customer_id: 'cus_1',
      stripe_sub_id: 'sub_1',
      status: 'active',
      plan: 'yearly',
      current_period_end: new Date(1_800_000_000 * 1000).toISOString(),
    })
  })

  test('subscription.deleted : statut canceled', async () => {
    const d = deps()
    await applyStripeEvent(
      {
        id: 'evt_3',
        type: 'customer.subscription.deleted',
        data: {
          object: {
            customer: 'cus_1',
            id: 'sub_1',
            status: 'canceled',
            current_period_end: 1_800_000_000,
            items: { data: [{ price: { id: 'price_m' } }] },
          },
        },
      },
      d,
    )
    expect(d.upsertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'canceled', plan: 'monthly' }),
    )
  })

  test('type non géré : marqué traité mais pas d’upsert', async () => {
    const d = deps()
    const result = await applyStripeEvent(
      { id: 'evt_4', type: 'invoice.paid', data: { object: {} } },
      d,
    )
    expect(result.handled).toBe(true)
    expect(d.upsertSubscription).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run netlify/functions/_shared/subscriptionUpsert.test.ts`
Expected: FAIL — import non résolu.

- [ ] **Step 3: Write the implementation**

```ts
// netlify/functions/_shared/subscriptionUpsert.ts
import { mapStripeStatus, planFromPriceId, type SubStatus } from './stripeStatus'

export interface StripeEventLike {
  id: string
  type: string
  data: { object: Record<string, unknown> }
}

export interface SubscriptionRow {
  stripe_customer_id: string
  stripe_sub_id: string | null
  status: SubStatus
  plan: 'monthly' | 'yearly' | null
  current_period_end: string | null
}

export interface UpsertDeps {
  monthlyPriceId: string
  yearlyPriceId: string
  upsertSubscription: (row: SubscriptionRow) => Promise<void>
  markProcessed: (eventId: string) => Promise<boolean>
}

const HANDLED_TYPES = new Set([
  'checkout.session.completed',
  'customer.subscription.updated',
  'customer.subscription.deleted',
])

export async function applyStripeEvent(
  event: StripeEventLike,
  deps: UpsertDeps,
): Promise<{ handled: boolean }> {
  const fresh = await deps.markProcessed(event.id)
  if (!fresh) {
    return { handled: false }
  }
  if (!HANDLED_TYPES.has(event.type) || event.type === 'checkout.session.completed') {
    // checkout.session.completed ne porte pas l'objet subscription complet :
    // on s'appuie sur customer.subscription.* pour l'état. Rien à écrire ici.
    return { handled: true }
  }
  const obj = event.data.object
  const priceId =
    (obj.items as { data?: { price?: { id?: string } }[] } | undefined)?.data?.[0]?.price
      ?.id ?? ''
  const periodEnd = obj.current_period_end as number | undefined
  await deps.upsertSubscription({
    stripe_customer_id: String(obj.customer),
    stripe_sub_id: (obj.id as string) ?? null,
    status: mapStripeStatus(String(obj.status)),
    plan: planFromPriceId(priceId, deps.monthlyPriceId, deps.yearlyPriceId),
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
  })
  return { handled: true }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run netlify/functions/_shared/subscriptionUpsert.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

Run: `npm run typecheck && npx prettier --write netlify && npm run lint && npm run test`
Expected: tout vert.

```bash
git add netlify/functions/_shared/subscriptionUpsert.ts netlify/functions/_shared/subscriptionUpsert.test.ts
git commit -m "feat(functions): logique idempotente d'upsert d'abonnement Stripe"
```

---

### Task 4: Helpers d'infrastructure (service_role + auth par requête)

**Files:**
- Create: `netlify/functions/_shared/supabaseAdmin.ts`
- Create: `netlify/functions/_shared/auth.ts`
- Test: `netlify/functions/_shared/auth.test.ts`

**Interfaces:**
- Consumes: `@supabase/supabase-js`, env `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Produces: `getAdminClient(): SupabaseClient` (service_role, mémoïsé) ; `userIdFromEvent(event: { headers: Record<string, string | undefined> }, verify: (token: string) => Promise<string | null>): Promise<string | null>` — extrait le Bearer token et délègue la vérification (injectable pour test).

- [ ] **Step 1: Write the failing test**

```ts
// netlify/functions/_shared/auth.test.ts
import { describe, expect, test, vi } from 'vitest'
import { userIdFromEvent } from './auth'

describe('userIdFromEvent', () => {
  test('extrait le Bearer token et renvoie l’userId vérifié', async () => {
    const verify = vi.fn().mockResolvedValue('u1')
    const id = await userIdFromEvent(
      { headers: { authorization: 'Bearer abc.def' } },
      verify,
    )
    expect(verify).toHaveBeenCalledWith('abc.def')
    expect(id).toBe('u1')
  })

  test('sans header Authorization : null sans appeler verify', async () => {
    const verify = vi.fn()
    expect(await userIdFromEvent({ headers: {} }, verify)).toBeNull()
    expect(verify).not.toHaveBeenCalled()
  })

  test('header mal formé : null', async () => {
    const verify = vi.fn()
    expect(
      await userIdFromEvent({ headers: { authorization: 'Basic xyz' } }, verify),
    ).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run netlify/functions/_shared/auth.test.ts`
Expected: FAIL — import non résolu.

- [ ] **Step 3: Write the implementations**

```ts
// netlify/functions/_shared/auth.ts
export async function userIdFromEvent(
  event: { headers: Record<string, string | undefined> },
  verify: (token: string) => Promise<string | null>,
): Promise<string | null> {
  const header = event.headers.authorization ?? event.headers.Authorization
  if (!header || !header.startsWith('Bearer ')) {
    return null
  }
  const token = header.slice('Bearer '.length)
  return verify(token)
}
```

```ts
// netlify/functions/_shared/supabaseAdmin.ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

let admin: SupabaseClient | null = null

// Client service_role : contourne la RLS. Uniquement côté serveur (Functions).
export function getAdminClient(): SupabaseClient {
  if (admin) {
    return admin
  }
  const url = process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY manquants')
  }
  admin = createClient(url, key, { auth: { persistSession: false } })
  return admin
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run netlify/functions/_shared/auth.test.ts`
Expected: PASS (`supabaseAdmin.ts` n'a pas de test dédié : couvert indirectement par les handlers ; hors périmètre de couverture).

- [ ] **Step 5: Typecheck, format, commit**

Run: `npm run typecheck && npx prettier --write netlify && npm run lint && npm run test`
Expected: tout vert.

```bash
git add netlify/functions/_shared/supabaseAdmin.ts netlify/functions/_shared/auth.ts netlify/functions/_shared/auth.test.ts
git commit -m "feat(functions): client service_role et extraction d'userId par requête"
```

---

### Task 5: Function stripe-checkout

**Files:**
- Create: `netlify/functions/stripe-checkout.ts`
- Test: `netlify/functions/stripe-checkout.test.ts`

**Interfaces:**
- Consumes: `userIdFromEvent` (`./_shared/auth`), `getAdminClient` (`./_shared/supabaseAdmin`), Stripe SDK, env `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `URL`.
- Produces: handler POST `{ plan: 'monthly' | 'yearly' }` → `{ url }`. Exporte `buildCheckout(deps)` (pur/injecté) : crée/réutilise le customer, l'enregistre dans `subscriptions` (status `incomplete`), crée la Checkout Session `mode: 'subscription'`.

- [ ] **Step 1: Write the failing tests**

```ts
// netlify/functions/stripe-checkout.test.ts
import { describe, expect, test, vi } from 'vitest'
import { buildCheckout } from './stripe-checkout'

const baseDeps = () => ({
  userId: 'u1',
  plan: 'monthly' as const,
  priceForPlan: { monthly: 'price_m', yearly: 'price_y' },
  siteUrl: 'https://site.test',
  findCustomerId: vi.fn().mockResolvedValue(null),
  createCustomer: vi.fn().mockResolvedValue('cus_new'),
  saveCustomer: vi.fn().mockResolvedValue(undefined),
  createSession: vi.fn().mockResolvedValue({ url: 'https://checkout.stripe/x' }),
})

describe('buildCheckout', () => {
  test('crée un customer, l’enregistre et renvoie l’URL de session', async () => {
    const d = baseDeps()
    const result = await buildCheckout(d)
    expect(d.createCustomer).toHaveBeenCalledWith('u1')
    expect(d.saveCustomer).toHaveBeenCalledWith('u1', 'cus_new')
    expect(d.createSession).toHaveBeenCalledWith({
      customer: 'cus_new',
      priceId: 'price_m',
      userId: 'u1',
      successUrl: 'https://site.test/?checkout=success',
      cancelUrl: 'https://site.test/?checkout=cancel',
    })
    expect(result).toEqual({ url: 'https://checkout.stripe/x' })
  })

  test('réutilise le customer existant', async () => {
    const d = baseDeps()
    d.findCustomerId.mockResolvedValue('cus_old')
    await buildCheckout(d)
    expect(d.createCustomer).not.toHaveBeenCalled()
    expect(d.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ customer: 'cus_old', priceId: 'price_m' }),
    )
  })

  test('plan yearly sélectionne le bon prix', async () => {
    const d = { ...baseDeps(), plan: 'yearly' as const }
    await buildCheckout(d)
    expect(d.createSession).toHaveBeenCalledWith(
      expect.objectContaining({ priceId: 'price_y' }),
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run netlify/functions/stripe-checkout.test.ts`
Expected: FAIL — import non résolu.

- [ ] **Step 3: Write the implementation**

```ts
// netlify/functions/stripe-checkout.ts
import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { getAdminClient } from './_shared/supabaseAdmin'
import { userIdFromEvent } from './_shared/auth'

export interface CheckoutDeps {
  userId: string
  plan: 'monthly' | 'yearly'
  priceForPlan: { monthly: string; yearly: string }
  siteUrl: string
  findCustomerId: (userId: string) => Promise<string | null>
  createCustomer: (userId: string) => Promise<string>
  saveCustomer: (userId: string, customerId: string) => Promise<void>
  createSession: (args: {
    customer: string
    priceId: string
    userId: string
    successUrl: string
    cancelUrl: string
  }) => Promise<{ url: string | null }>
}

export async function buildCheckout(deps: CheckoutDeps): Promise<{ url: string | null }> {
  let customerId = await deps.findCustomerId(deps.userId)
  if (!customerId) {
    customerId = await deps.createCustomer(deps.userId)
    await deps.saveCustomer(deps.userId, customerId)
  }
  const priceId = deps.priceForPlan[deps.plan]
  return deps.createSession({
    customer: customerId,
    priceId,
    userId: deps.userId,
    successUrl: `${deps.siteUrl}/?checkout=success`,
    cancelUrl: `${deps.siteUrl}/?checkout=cancel`,
  })
}

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')
  const admin = getAdminClient()

  const userId = await userIdFromEvent({ headers: event.headers }, async (token) => {
    const { data } = await admin.auth.getUser(token)
    return data.user?.id ?? null
  })
  if (!userId) {
    return json(401, { error: 'unauthorized' })
  }

  const plan = (JSON.parse(event.body ?? '{}').plan as 'monthly' | 'yearly') ?? 'monthly'
  const result = await buildCheckout({
    userId,
    plan,
    priceForPlan: {
      monthly: process.env.STRIPE_PRICE_MONTHLY ?? '',
      yearly: process.env.STRIPE_PRICE_YEARLY ?? '',
    },
    siteUrl: process.env.URL ?? '',
    findCustomerId: async (uid) => {
      const { data } = await admin
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', uid)
        .maybeSingle()
      return data?.stripe_customer_id ?? null
    },
    createCustomer: async (uid) => {
      const customer = await stripe.customers.create({ metadata: { user_id: uid } })
      return customer.id
    },
    saveCustomer: async (uid, customerId) => {
      await admin
        .from('subscriptions')
        .upsert({ user_id: uid, stripe_customer_id: customerId, status: 'incomplete' })
    },
    createSession: async (args) => {
      const session = await stripe.checkout.sessions.create({
        mode: 'subscription',
        customer: args.customer,
        line_items: [{ price: args.priceId, quantity: 1 }],
        client_reference_id: args.userId,
        success_url: args.successUrl,
        cancel_url: args.cancelUrl,
      })
      return { url: session.url }
    },
  })
  return json(200, result)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run netlify/functions/stripe-checkout.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

Run: `npm run typecheck && npx prettier --write netlify && npm run lint && npm run test`
Expected: tout vert.

```bash
git add netlify/functions/stripe-checkout.ts netlify/functions/stripe-checkout.test.ts
git commit -m "feat(functions): stripe-checkout (création de session d'abonnement)"
```

---

### Task 6: Function stripe-webhook

**Files:**
- Create: `netlify/functions/stripe-webhook.ts`
- Test: `netlify/functions/stripe-webhook.test.ts`

**Interfaces:**
- Consumes: `applyStripeEvent`, `StripeEventLike`, `SubscriptionRow`, `UpsertDeps` (`./_shared/subscriptionUpsert`), `getAdminClient`, Stripe SDK, env `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`.
- Produces: handler POST (raw body + header `stripe-signature`) → 200 après écriture, 400 si signature invalide. Exporte `processWebhook(rawBody, signature, deps)` pur pour test.

- [ ] **Step 1: Write the failing tests**

```ts
// netlify/functions/stripe-webhook.test.ts
import { describe, expect, test, vi } from 'vitest'
import { processWebhook } from './stripe-webhook'

const deps = (verified = true) => ({
  verifySignature: vi.fn(() => {
    if (!verified) {
      throw new Error('bad signature')
    }
    return { id: 'evt_1', type: 'customer.subscription.updated', data: { object: {} } }
  }),
  apply: vi.fn().mockResolvedValue({ handled: true }),
})

describe('processWebhook', () => {
  test('signature valide : applique l’event, renvoie 200', async () => {
    const d = deps()
    const res = await processWebhook('raw', 'sig', d)
    expect(d.apply).toHaveBeenCalled()
    expect(res.statusCode).toBe(200)
  })

  test('signature invalide : 400, pas d’application', async () => {
    const d = deps(false)
    const res = await processWebhook('raw', 'sig', d)
    expect(res.statusCode).toBe(400)
    expect(d.apply).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run netlify/functions/stripe-webhook.test.ts`
Expected: FAIL — import non résolu.

- [ ] **Step 3: Write the implementation**

```ts
// netlify/functions/stripe-webhook.ts
import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { getAdminClient } from './_shared/supabaseAdmin'
import {
  applyStripeEvent,
  type StripeEventLike,
  type SubscriptionRow,
  type UpsertDeps,
} from './_shared/subscriptionUpsert'

export interface WebhookDeps {
  verifySignature: (rawBody: string, signature: string) => StripeEventLike
  apply: (event: StripeEventLike) => Promise<{ handled: boolean }>
}

export async function processWebhook(
  rawBody: string,
  signature: string,
  deps: WebhookDeps,
): Promise<{ statusCode: number; body: string }> {
  let event: StripeEventLike
  try {
    event = deps.verifySignature(rawBody, signature)
  } catch {
    return { statusCode: 400, body: 'invalid signature' }
  }
  await deps.apply(event)
  return { statusCode: 200, body: 'ok' }
}

export const handler: Handler = async (event) => {
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')
  const admin = getAdminClient()
  const signature = event.headers['stripe-signature'] ?? ''

  const result = await processWebhook(event.body ?? '', signature, {
    verifySignature: (rawBody, sig) =>
      stripe.webhooks.constructEvent(
        rawBody,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET ?? '',
      ) as unknown as StripeEventLike,
    apply: (evt) => {
      const upsertDeps: UpsertDeps = {
        monthlyPriceId: process.env.STRIPE_PRICE_MONTHLY ?? '',
        yearlyPriceId: process.env.STRIPE_PRICE_YEARLY ?? '',
        upsertSubscription: async (row: SubscriptionRow) => {
          await admin
            .from('subscriptions')
            .update({
              stripe_sub_id: row.stripe_sub_id,
              status: row.status,
              plan: row.plan,
              current_period_end: row.current_period_end,
            })
            .eq('stripe_customer_id', row.stripe_customer_id)
        },
        markProcessed: async (eventId: string) => {
          const { error } = await admin.from('stripe_events').insert({ id: eventId })
          return !error
        },
      }
      return applyStripeEvent(evt, upsertDeps)
    },
  })
  return { statusCode: result.statusCode, body: result.body }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run netlify/functions/stripe-webhook.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck, format, commit**

Run: `npm run typecheck && npx prettier --write netlify && npm run lint && npm run test`
Expected: tout vert.

```bash
git add netlify/functions/stripe-webhook.ts netlify/functions/stripe-webhook.test.ts
git commit -m "feat(functions): stripe-webhook (signature vérifiée, idempotent)"
```

---

### Task 7: Function stripe-portal + client billingApi

**Files:**
- Create: `netlify/functions/stripe-portal.ts`
- Test: `netlify/functions/stripe-portal.test.ts`
- Create: `src/lib/billingApi.ts`
- Test: `src/lib/billingApi.test.ts`

**Interfaces:**
- Consumes: `userIdFromEvent`, `getAdminClient`, Stripe SDK (portal) ; côté client `getSupabase` (`./supabase`).
- Produces:
  - `stripe-portal` : `buildPortal(deps)` + handler POST → `{ url }` (portail de facturation du customer courant).
  - `billingApi.ts` : `class QuotaExceededError extends Error` ; `startDrillSession(): Promise<{ remaining: number | null }>` (RPC ; lève `QuotaExceededError` si message `quota_exceeded`) ; `fetchSubscriptionStatus(): Promise<{ isPremium: boolean; plan: 'monthly' | 'yearly' | null }>` ; `startCheckout(plan: 'monthly' | 'yearly'): Promise<string>` (renvoie l'URL) ; `openBillingPortal(): Promise<string>`.

- [ ] **Step 1: Write the failing tests (portal)**

```ts
// netlify/functions/stripe-portal.test.ts
import { describe, expect, test, vi } from 'vitest'
import { buildPortal } from './stripe-portal'

describe('buildPortal', () => {
  test('crée une session de portail pour le customer et renvoie l’URL', async () => {
    const findCustomerId = vi.fn().mockResolvedValue('cus_1')
    const createPortal = vi.fn().mockResolvedValue({ url: 'https://portal/x' })
    const result = await buildPortal({
      userId: 'u1',
      siteUrl: 'https://site.test',
      findCustomerId,
      createPortal,
    })
    expect(createPortal).toHaveBeenCalledWith({
      customer: 'cus_1',
      returnUrl: 'https://site.test/',
    })
    expect(result).toEqual({ url: 'https://portal/x' })
  })

  test('sans customer : renvoie url null', async () => {
    const result = await buildPortal({
      userId: 'u1',
      siteUrl: 'https://site.test',
      findCustomerId: vi.fn().mockResolvedValue(null),
      createPortal: vi.fn(),
    })
    expect(result).toEqual({ url: null })
  })
})
```

- [ ] **Step 2: Run (fail), then implement stripe-portal**

Run: `npx vitest run netlify/functions/stripe-portal.test.ts` → FAIL.

```ts
// netlify/functions/stripe-portal.ts
import type { Handler } from '@netlify/functions'
import Stripe from 'stripe'
import { getAdminClient } from './_shared/supabaseAdmin'
import { userIdFromEvent } from './_shared/auth'

export interface PortalDeps {
  userId: string
  siteUrl: string
  findCustomerId: (userId: string) => Promise<string | null>
  createPortal: (args: { customer: string; returnUrl: string }) => Promise<{
    url: string | null
  }>
}

export async function buildPortal(deps: PortalDeps): Promise<{ url: string | null }> {
  const customerId = await deps.findCustomerId(deps.userId)
  if (!customerId) {
    return { url: null }
  }
  return deps.createPortal({ customer: customerId, returnUrl: `${deps.siteUrl}/` })
}

const json = (statusCode: number, body: unknown) => ({
  statusCode,
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
})

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'method_not_allowed' })
  }
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '')
  const admin = getAdminClient()
  const userId = await userIdFromEvent({ headers: event.headers }, async (token) => {
    const { data } = await admin.auth.getUser(token)
    return data.user?.id ?? null
  })
  if (!userId) {
    return json(401, { error: 'unauthorized' })
  }
  const result = await buildPortal({
    userId,
    siteUrl: process.env.URL ?? '',
    findCustomerId: async (uid) => {
      const { data } = await admin
        .from('subscriptions')
        .select('stripe_customer_id')
        .eq('user_id', uid)
        .maybeSingle()
      return data?.stripe_customer_id ?? null
    },
    createPortal: async (args) => {
      const session = await stripe.billingPortal.sessions.create({
        customer: args.customer,
        return_url: args.returnUrl,
      })
      return { url: session.url }
    },
  })
  return json(200, result)
}
```

Run: `npx vitest run netlify/functions/stripe-portal.test.ts` → PASS.

- [ ] **Step 3: Write the failing tests (billingApi)**

```ts
// src/lib/billingApi.test.ts
import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  fetchSubscriptionStatus,
  openBillingPortal,
  QuotaExceededError,
  startCheckout,
  startDrillSession,
} from './billingApi'
import { getSupabase } from './supabase'

vi.mock('./supabase', () => ({ getSupabase: vi.fn() }))

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('startDrillSession', () => {
  test('renvoie remaining', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { remaining: 2 }, error: null })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    await expect(startDrillSession()).resolves.toEqual({ remaining: 2 })
    expect(rpc).toHaveBeenCalledWith('start_drill_session', undefined)
  })

  test('quota_exceeded : lève QuotaExceededError', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: 'quota_exceeded' } })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    await expect(startDrillSession()).rejects.toBeInstanceOf(QuotaExceededError)
  })
})

describe('fetchSubscriptionStatus', () => {
  test('mappe is_premium et plan', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValue({ data: { is_premium: true, plan: 'yearly' }, error: null })
    vi.mocked(getSupabase).mockReturnValue({ rpc } as never)
    await expect(fetchSubscriptionStatus()).resolves.toEqual({
      isPremium: true,
      plan: 'yearly',
    })
  })
})

describe('startCheckout / openBillingPortal', () => {
  const stubSession = () =>
    vi.mocked(getSupabase).mockReturnValue({
      auth: {
        getSession: vi
          .fn()
          .mockResolvedValue({ data: { session: { access_token: 'tok' } } }),
      },
    } as never)

  test('startCheckout POSTe le plan avec le token et renvoie l’URL', async () => {
    stubSession()
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ url: 'https://co/x' }) })
    vi.stubGlobal('fetch', fetchMock)
    await expect(startCheckout('monthly')).resolves.toBe('https://co/x')
    expect(fetchMock).toHaveBeenCalledWith(
      '/.netlify/functions/stripe-checkout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ authorization: 'Bearer tok' }),
        body: JSON.stringify({ plan: 'monthly' }),
      }),
    )
  })

  test('openBillingPortal renvoie l’URL', async () => {
    stubSession()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ url: 'https://p/x' }) }),
    )
    await expect(openBillingPortal()).resolves.toBe('https://p/x')
  })
})
```

- [ ] **Step 4: Run (fail), then implement billingApi**

Run: `npx vitest run src/lib/billingApi.test.ts` → FAIL.

```ts
// src/lib/billingApi.ts
import { getSupabase } from './supabase'

export class QuotaExceededError extends Error {
  constructor() {
    super('quota_exceeded')
    this.name = 'QuotaExceededError'
  }
}

export async function startDrillSession(): Promise<{ remaining: number | null }> {
  const { data, error } = await getSupabase().rpc('start_drill_session')
  if (error) {
    if (error.message.includes('quota_exceeded')) {
      throw new QuotaExceededError()
    }
    throw new Error(error.message)
  }
  return { remaining: (data as { remaining: number | null }).remaining }
}

export async function fetchSubscriptionStatus(): Promise<{
  isPremium: boolean
  plan: 'monthly' | 'yearly' | null
}> {
  const { data, error } = await getSupabase().rpc('get_subscription_status')
  if (error) {
    throw new Error(error.message)
  }
  const json = data as { is_premium: boolean; plan: 'monthly' | 'yearly' | null }
  return { isPremium: json.is_premium, plan: json.plan }
}

async function postFunction(path: string, body?: unknown): Promise<string> {
  const { data } = await getSupabase().auth.getSession()
  const token = data.session?.access_token ?? ''
  const response = await fetch(`/.netlify/functions/${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!response.ok) {
    throw new Error(`function ${path} a échoué (${response.status})`)
  }
  const json = (await response.json()) as { url: string | null }
  if (!json.url) {
    throw new Error(`function ${path} : URL absente`)
  }
  return json.url
}

export function startCheckout(plan: 'monthly' | 'yearly'): Promise<string> {
  return postFunction('stripe-checkout', { plan })
}

export function openBillingPortal(): Promise<string> {
  return postFunction('stripe-portal')
}
```

Run: `npx vitest run src/lib/billingApi.test.ts` → PASS.

- [ ] **Step 5: Typecheck, format, commit**

Run: `npm run typecheck && npx prettier --write netlify src/lib && npm run lint && npm run test`
Expected: tout vert.

```bash
git add netlify/functions/stripe-portal.ts netlify/functions/stripe-portal.test.ts src/lib/billingApi.ts src/lib/billingApi.test.ts
git commit -m "feat(billing): stripe-portal et couche client billingApi (quota, statut, checkout, portail)"
```

---

### Task 8: subscriptionStore + PaywallPanel

**Files:**
- Create: `src/features/billing/subscriptionStore.ts`
- Test: `src/features/billing/subscriptionStore.test.ts`
- Create: `src/features/billing/PaywallPanel.tsx`
- Test: `src/features/billing/PaywallPanel.test.tsx`
- Modify: `src/i18n/locales/fr.json` (bloc `billing`)

**Interfaces:**
- Consumes: `startCheckout` (`../../lib/billingApi`) ; Zustand ; i18n.
- Produces: `useSubscriptionStore` avec `{ isPremium: boolean; plan: 'monthly' | 'yearly' | null; setStatus: (s: { isPremium: boolean; plan: 'monthly' | 'yearly' | null }) => void }` ; `PaywallPanel({ onClose }: { onClose?: () => void })` — deux offres (mensuel/annuel) avec boutons qui redirigent vers Stripe.

- [ ] **Step 1: Write + implement subscriptionStore (TDD)**

```ts
// src/features/billing/subscriptionStore.test.ts
import { beforeEach, describe, expect, test } from 'vitest'
import { useSubscriptionStore } from './subscriptionStore'

describe('useSubscriptionStore', () => {
  beforeEach(() => {
    useSubscriptionStore.setState({ isPremium: false, plan: null })
  })

  test('état initial : non premium', () => {
    expect(useSubscriptionStore.getState().isPremium).toBe(false)
    expect(useSubscriptionStore.getState().plan).toBeNull()
  })

  test('setStatus met à jour premium et plan', () => {
    useSubscriptionStore.getState().setStatus({ isPremium: true, plan: 'monthly' })
    expect(useSubscriptionStore.getState()).toMatchObject({
      isPremium: true,
      plan: 'monthly',
    })
  })
})
```

Run (fail), puis :

```ts
// src/features/billing/subscriptionStore.ts
import { create } from 'zustand'

export interface SubscriptionState {
  readonly isPremium: boolean
  readonly plan: 'monthly' | 'yearly' | null
  setStatus: (status: { isPremium: boolean; plan: 'monthly' | 'yearly' | null }) => void
}

export const useSubscriptionStore = create<SubscriptionState>((set) => ({
  isPremium: false,
  plan: null,
  setStatus: ({ isPremium, plan }) => set({ isPremium, plan }),
}))
```

Run → PASS.

- [ ] **Step 2: Add i18n keys (fr.json, nouveau bloc `billing`)**

Ajouter la clé `"billing"` au même niveau que `"app"`, `"drill"`, `"auth"` :

```json
  "billing": {
    "title": "Passe en illimité",
    "quotaReached": "Tu as utilisé tes 3 sessions gratuites du jour.",
    "monthly": "Mensuel",
    "yearly": "Annuel (2 mois offerts)",
    "manage": "Gérer mon abonnement",
    "premiumBadge": "Premium",
    "close": "Plus tard",
    "error": "Le paiement n’a pas pu démarrer. Réessaie."
  }
```

- [ ] **Step 3: Write the failing tests (PaywallPanel)**

```tsx
// src/features/billing/PaywallPanel.test.tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import * as billingApi from '../../lib/billingApi'
import { PaywallPanel } from './PaywallPanel'

vi.mock('../../lib/billingApi')

afterEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
})

describe('PaywallPanel', () => {
  test('affiche les deux offres et le message de quota', () => {
    render(<PaywallPanel />)
    expect(
      screen.getByText('Tu as utilisé tes 3 sessions gratuites du jour.'),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mensuel' })).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Annuel (2 mois offerts)' }),
    ).toBeInTheDocument()
  })

  test('clic sur Mensuel : lance le checkout et redirige', async () => {
    vi.mocked(billingApi.startCheckout).mockResolvedValue('https://checkout/x')
    const assign = vi.fn()
    vi.stubGlobal('location', { assign } as unknown as Location)
    render(<PaywallPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Mensuel' }))
    await waitFor(() => expect(billingApi.startCheckout).toHaveBeenCalledWith('monthly'))
    await waitFor(() => expect(assign).toHaveBeenCalledWith('https://checkout/x'))
  })

  test('erreur de checkout : message affiché', async () => {
    vi.mocked(billingApi.startCheckout).mockRejectedValue(new Error('boom'))
    render(<PaywallPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Annuel (2 mois offerts)' }))
    await waitFor(() =>
      expect(
        screen.getByText('Le paiement n’a pas pu démarrer. Réessaie.'),
      ).toBeInTheDocument(),
    )
  })
})
```

- [ ] **Step 4: Run (fail), then implement PaywallPanel**

Run: `npx vitest run src/features/billing/PaywallPanel.test.tsx` → FAIL.

```tsx
// src/features/billing/PaywallPanel.tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { startCheckout } from '../../lib/billingApi'

export function PaywallPanel({ onClose }: { onClose?: () => void }) {
  const { t } = useTranslation()
  const [error, setError] = useState(false)

  const subscribe = async (plan: 'monthly' | 'yearly') => {
    setError(false)
    try {
      const url = await startCheckout(plan)
      window.location.assign(url)
    } catch {
      setError(true)
    }
  }

  return (
    <section aria-label={t('billing.title')}>
      <h2>{t('billing.title')}</h2>
      <p>{t('billing.quotaReached')}</p>
      <button type="button" onClick={() => void subscribe('monthly')}>
        {t('billing.monthly')}
      </button>
      <button type="button" onClick={() => void subscribe('yearly')}>
        {t('billing.yearly')}
      </button>
      {onClose && (
        <button type="button" onClick={onClose}>
          {t('billing.close')}
        </button>
      )}
      {error && <p role="alert">{t('billing.error')}</p>}
    </section>
  )
}
```

Run → PASS.

- [ ] **Step 5: Typecheck, format, commit**

Run: `npm run lint && npm run typecheck && npx prettier --write src && npm run test`
Expected: tout vert.

```bash
git add src/features/billing/subscriptionStore.ts src/features/billing/subscriptionStore.test.ts src/features/billing/PaywallPanel.tsx src/features/billing/PaywallPanel.test.tsx src/i18n/locales/fr.json
git commit -m "feat(billing): store d'abonnement et paywall (pricing mensuel/annuel)"
```

---

### Task 9: Câblage du quota dans DrillScreen + badge premium

**Files:**
- Modify: `src/features/drill/DrillScreen.tsx`
- Modify: `src/features/drill/DrillScreen.test.tsx`
- Modify: `src/App.tsx` (charge le statut d'abonnement à la connexion)
- Modify: `src/App.test.tsx`

**Interfaces:**
- Consumes: `startDrillSession`, `QuotaExceededError`, `fetchSubscriptionStatus`, `openBillingPortal` (`../../lib/billingApi`) ; `useSubscriptionStore`, `PaywallPanel` (`../billing/…`) ; `useAuthStore`.
- Produces: `DrillScreen` : quand connecté, `handleStart` appelle `startDrillSession()` avant de démarrer ; sur `QuotaExceededError` → affiche `PaywallPanel`. Badge premium + bouton « Gérer mon abonnement » si `isPremium`. Anonyme : comportement Phase 2 inchangé.

- [ ] **Step 1: Write the failing tests (ajouts à DrillScreen.test.tsx)**

Ajouter les imports/mocks en tête :

```tsx
import { useSubscriptionStore } from '../billing/subscriptionStore'
import * as billingApi from '../../lib/billingApi'

vi.mock('../../lib/billingApi')
```

Dans le `beforeEach` du bloc « connecté », ajouter :

```tsx
    useSubscriptionStore.setState({ isPremium: false, plan: null })
    vi.mocked(billingApi.startDrillSession).mockResolvedValue({ remaining: 2 })
```

Ajouter ces tests dans le bloc `describe('DrillScreen — connecté', …)` :

```tsx
  test('quota atteint : affiche le paywall au lieu de démarrer', async () => {
    vi.mocked(billingApi.startDrillSession).mockRejectedValue(
      new billingApi.QuotaExceededError(),
    )
    render(<DrillScreen />)
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la session' }))
    await vi.waitFor(() =>
      expect(
        screen.getByText('Tu as utilisé tes 3 sessions gratuites du jour.'),
      ).toBeInTheDocument(),
    )
    expect(screen.queryByText('Carte 1 / 20')).not.toBeInTheDocument()
  })

  test('premium : badge affiché, démarrage sans blocage', async () => {
    useSubscriptionStore.setState({ isPremium: true, plan: 'monthly' })
    render(<DrillScreen />)
    expect(screen.getByText('Premium')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Lancer la session' }))
    await vi.waitFor(() =>
      expect(screen.getByText('Carte 0 / 20')).toBeInTheDocument(),
    )
    act(() => {
      vi.advanceTimersByTime(1200)
    })
    expect(screen.getByText('Carte 1 / 20')).toBeInTheDocument()
  })
```

Note : `handleStart` étant async (attend `startDrillSession`), le démarrage réel est différé — d'où `vi.waitFor` avant d'avancer les timers.

- [ ] **Step 2: Run (fail), then modify DrillScreen**

Run: `npx vitest run src/features/drill/DrillScreen.test.tsx` → FAIL.

Ajouter les imports en tête de `src/features/drill/DrillScreen.tsx` :

```tsx
import {
  startDrillSession,
  QuotaExceededError,
  openBillingPortal,
} from '../../lib/billingApi'
import { useSubscriptionStore } from '../billing/subscriptionStore'
import { PaywallPanel } from '../billing/PaywallPanel'
```

Dans le composant, après les hooks existants, ajouter l'état paywall + `handleStart` :

```tsx
  const isPremium = useSubscriptionStore((state) => state.isPremium)
  const [showPaywall, setShowPaywall] = useState(false)

  const handleStart = async () => {
    if (isAuthenticated) {
      try {
        await startDrillSession()
      } catch (err) {
        if (err instanceof QuotaExceededError) {
          setShowPaywall(true)
          return
        }
        throw err
      }
    }
    start(getTierConfig(selectedTier))
  }
```

Dans l'en-tête, ajouter (après le bloc streak) le badge premium :

```tsx
        {isPremium && (
          <>
            <span>{t('billing.premiumBadge')}</span>
            <button
              type="button"
              onClick={() =>
                void openBillingPortal().then((u) => window.location.assign(u))
              }
            >
              {t('billing.manage')}
            </button>
          </>
        )}
```

Remplacer la branche de sélection (`!session`) pour intercaler le paywall et appeler `handleStart` :

```tsx
      ) : showPaywall ? (
        <PaywallPanel onClose={() => setShowPaywall(false)} />
      ) : !session ? (
        <>
          <TierPicker selected={selectedTier} onSelect={setSelectedTier} />
          <button type="button" onClick={() => void handleStart()}>
            {t('drill.start')}
          </button>
        </>
```

- [ ] **Step 3: Load subscription status on sign-in (App.tsx)**

Ajouter les imports à `src/App.tsx` :

```tsx
import { useEffect } from 'react'
import { fetchSubscriptionStatus } from './lib/billingApi'
import { useAuthStore } from './features/auth/authStore'
import { useSubscriptionStore } from './features/billing/subscriptionStore'
```

Dans `App`, ajouter l'effet de chargement du statut :

```tsx
  const isAuthenticated = useAuthStore((state) => state.status === 'authenticated')
  const setStatus = useSubscriptionStore((state) => state.setStatus)

  useEffect(() => {
    if (isAuthenticated) {
      void fetchSubscriptionStatus().then(setStatus)
    }
  }, [isAuthenticated, setStatus])
```

Mettre à jour `src/App.test.tsx` : ajouter le mock de billingApi et stubber `fetchSubscriptionStatus`. En tête :

```tsx
import * as billingApi from './lib/billingApi'
vi.mock('./lib/billingApi')
```

Dans le `beforeEach` :

```tsx
    vi.mocked(billingApi.fetchSubscriptionStatus).mockResolvedValue({
      isPremium: false,
      plan: null,
    })
```

- [ ] **Step 4: Run the full suite**

Run: `npm run test`
Expected: PASS — tous les blocs (anonyme, connecté, premium, quota).

- [ ] **Step 5: Verify gates and commit**

Run: `npm run lint && npm run typecheck && npx prettier --write src && npm run format:check && npm run test`
Expected: tout vert.

```bash
git add src/features/drill/DrillScreen.tsx src/features/drill/DrillScreen.test.tsx src/App.tsx src/App.test.tsx
git commit -m "feat(billing): quota serveur avant session, paywall et badge premium"
```

---

### Task 10: Clôture — couverture, build, push, 🧑 config Stripe/Netlify + e2e test

**Files:**
- Aucun nouveau fichier (corrections de couverture éventuelles).

- [ ] **Step 1: Coverage**

Run: `npm run test:coverage`
Expected: PASS — global (scope `src/**`) ≥ 80 %, `src/engine/**` = 100 %. Les nouveaux fichiers client (`billingApi`, `subscriptionStore`, `PaywallPanel`, DrillScreen modifié) doivent être couverts ; ajouter le test manquant si le global chute (ne jamais abaisser le seuil). Les Netlify Functions (hors `src/`) ne comptent pas dans la couverture mais leurs tests doivent passer.

- [ ] **Step 2: Full gates**

Run: `npm run lint && npm run typecheck && npm run format:check && npm run test && npm run build`
Expected: tout vert. `git status` propre : recommiter tout fichier reformaté par prettier après un commit (piège CI connu — vérifier qu'aucun fichier suivi n'est « modified »).

- [ ] **Step 3: Push**

```bash
git push
```

- [ ] **Step 4: Verify CI**

`https://api.github.com/repos/mathis1812/-cardcount-/actions/runs?per_page=1` → `"status": "completed", "conclusion": "success"`.

- [ ] **Step 5: 🧑 Configure Stripe (mode test)**

Dashboard Stripe (mode test) : créer un **produit** « CardCount Premium » avec deux **prix** récurrents (mensuel ~9 €, annuel ~90 €). Noter les `price_id`. Récupérer la clé secrète test `sk_test_…`. Activer le **portail client** (Settings → Billing → Customer portal).

- [ ] **Step 6: 🧑 Configure Netlify env + webhook**

- Netlify → Environment variables : `STRIPE_SECRET_KEY`, `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Redéployer.
- Stripe → Developers → Webhooks : endpoint `https://<site>.netlify.app/.netlify/functions/stripe-webhook`, événements `checkout.session.completed`, `customer.subscription.updated`, `customer.subscription.deleted`. Copier le `whsec_…` dans `STRIPE_WEBHOOK_SECRET` (Netlify), redéployer.

- [ ] **Step 7: 🧑 Apply migration 0003**

Supabase → SQL Editor : exécuter `supabase/migrations/0003_billing_quotas.sql`.

- [ ] **Step 8: 🧑 End-to-end test (critère de sortie)**

Sur le site : se connecter, jouer 3 sessions (4ᵉ bloquée → paywall), cliquer « Mensuel », payer avec la carte test `4242 4242 4242 4242`. Après retour, vérifier le badge Premium et le déblocage des sessions. Vérifier dans Supabase : `subscriptions.status = 'active'`, `daily_usage` incrémenté, `stripe_events` contient l'event. Tester « Gérer mon abonnement » (portail).

---

## Vérification de fin de phase

1. Gates locaux verts (lint, typecheck, format, tests, coverage ≥ 80 %, build).
2. CI GitHub Actions verte sur `main`.
3. Migration `0003` appliquée ; 3 fonctions Stripe déployées ; webhook configuré et vérifié.
4. Quota serveur effectif : 4ᵉ session gratuite bloquée → paywall ; illimité une fois premium.
5. Paiement test de bout en bout : abonnement `active`, badge premium, portail client fonctionnel.
6. Idempotence : rejouer un event webhook (Stripe CLI `stripe events resend`) n'altère pas l'état.
7. Zéro secret dans le bundle client (seuls `sk_/whsec_/service_role` en env Netlify) ; zéro texte en dur.
