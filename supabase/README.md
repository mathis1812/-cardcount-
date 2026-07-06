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

## Vérifier

- **Table Editor** : `profiles`, `streaks`, `drill_sessions` présentes, RLS activé (cadenas).
- Créer un utilisateur test (Auth → Add user) → une ligne apparaît dans `profiles` et `streaks`.
- **Database → Functions** : `handle_new_user`, `level_from_xp`, `record_activity`,
  `get_profile`, `record_drill_session`, `migrate_anonymous_progress`.
