# Migrations Supabase — CardCount

Migrations SQL versionnées, à appliquer dans l'ordre sur le projet Supabase
(région EU). Source de vérité du schéma : ces fichiers.

## Appliquer (option A — SQL editor, recommandé au MVP)

1. Ouvrir le projet Supabase → **SQL Editor**.
2. Coller le contenu de `migrations/0001_profiles_streaks_sessions.sql`, exécuter.
3. Coller le contenu de `migrations/0002_functions.sql`, exécuter.
4. Coller le contenu de `migrations/0003_billing_quotas.sql`, exécuter.
5. **Auth → Providers → Email** : désactiver « Confirm email » pour le MVP
   (l'inscription ouvre une session immédiatement). Réactivable plus tard.

## Appliquer (option B — CLI)

```
npm i -g supabase
supabase link --project-ref <ref>
supabase db push
```

## Variables d'environnement Netlify

Pour que l'auth fonctionne en ligne, définir dans Netlify
(Site settings → Environment variables) :

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

(valeurs dans Supabase → Settings → API). Le drill anonyme fonctionne sans,
mais les comptes non.

## Variables d'environnement Netlify (Phase 4 — Stripe)

Secrets serveur (jamais préfixés `VITE_`, jamais dans le bundle) :

- `STRIPE_SECRET_KEY` (clé test `sk_test_…`)
- `STRIPE_WEBHOOK_SECRET` (`whsec_…`, donné par Stripe à la création du webhook)
- `STRIPE_PRICE_MONTHLY`, `STRIPE_PRICE_YEARLY` (id des prix Stripe `price_…`)
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API)

Webhook Stripe : endpoint `https://<site>.netlify.app/.netlify/functions/stripe-webhook`,
événements `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted`.

## Vérifier

- **Table Editor** : `profiles`, `streaks`, `drill_sessions` présentes, RLS activé (cadenas).
- Créer un utilisateur test (Auth → Add user) → une ligne apparaît dans `profiles` et `streaks`.
- **Database → Functions** : `handle_new_user`, `level_from_xp`, `record_activity`,
  `get_profile`, `record_drill_session`, `migrate_anonymous_progress`.
