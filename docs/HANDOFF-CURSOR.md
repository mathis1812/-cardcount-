# CardCount — Dossier de passation (Claude Code → Cursor)

Document rédigé le 2026-07-16 pour reprendre le projet dans un autre outil.
Tout le code est déjà dans ce dossier et poussé sur GitHub
(`github.com/mathis1812/-cardcount-`, branche `main`, dernier commit `ff3d379`
au moment de la rédaction). Aucun export n'est nécessaire : ouvrir ce dossier
dans Cursor donne accès à tout.

## 1. Le projet

**CardCount** : app SaaS façon Duolingo pour s'entraîner au comptage de
cartes Hi-Lo au blackjack, marché FR/EU. Solo entrepreneur, développement
piloté à 100% par IA (Claude Code jusqu'ici).

Spec de conception canonique (à toujours consulter avant d'ajouter une
fonctionnalité) : `docs/superpowers/specs/2026-07-05-cardcount-design.md`.

Plans d'implémentation détaillés par phase :
`docs/superpowers/plans/2026-07-07-phase-4-monetisation.md` (et équivalents
pour les phases précédentes s'ils existent dans ce dossier).

## 2. Stack technique

- **Frontend** : Vite + React 19 + TypeScript, SPA (pas de framework
  serveur), i18n via `react-i18next` (une seule langue active : `fr`).
- **Backend/données** : Supabase (Postgres + Auth + Row Level Security).
  Réf. projet : `feinwygmaoijvsrbjwle`
  (URL : `https://feinwygmaoijvsrbjwle.supabase.co`).
- **Hébergement + fonctions serveur** : Vercel (migré depuis Netlify dans
  cette session). Projet Vercel : `mathisvrg-s-projects/cardcount`.
- **Paiements** : Stripe (abonnements mensuel/annuel), mode test pour
  l'instant (carte de test `4242 4242 4242 4242`).
- **Tests** : Vitest + React Testing Library, TDD strict depuis le début.
  Seuils de couverture bloquants (voir `vite.config.ts`) : 80% global,
  **100% sur `src/engine/**`**.
- **CI** : GitHub Actions (`.github/workflows/ci.yml`) — lint, typecheck,
  format:check, test, build sur push/PR vers `main`.

## 3. Arborescence et rôle de chaque dossier

```
src/
├── engine/     # Moteur Hi-Lo pur (TS, zéro dépendance UI/réseau). 100% coverage obligatoire.
├── features/
│   ├── auth/       # authStore (Zustand), AuthPanel, initAuth (écoute onAuthStateChange)
│   ├── billing/     # subscriptionStore, PaywallPanel (pricing mensuel/annuel)
│   └── drill/       # DrillScreen (écran principal), CardView, CountInput, TierPicker,
│                    # ResultsPanel, ReplayPanel, useDrillSession, profileStore (local,
│                    # progression anonyme), serverProfileStore (progression connectée)
├── lib/
│   ├── supabase.ts   # Client Supabase à instanciation paresseuse (lève une erreur
│   │                 # explicite si VITE_SUPABASE_URL/ANON_KEY manquent — l'app doit
│   │                 # pouvoir tourner en mode anonyme sans Supabase configuré)
│   ├── authClient.ts # signUp/signIn/signOut/getCurrentUserId/onAuthChange
│   ├── profileApi.ts # recordDrillSession, migrateAnonymousProgress (RPC Postgres)
│   └── billingApi.ts # startDrillSession, fetchSubscriptionStatus, startCheckout,
│                     # openBillingPortal, QuotaExceededError
└── i18n/
    └── locales/fr.json  # SOURCE UNIQUE de toutes les chaînes UI. Zéro texte en dur
                          # dans les composants — règle stricte du spec.

api/                      # Fonctions serverless Vercel (ex-Netlify Functions)
├── stripe-checkout.ts     # Crée/réutilise le customer Stripe, ouvre une Checkout Session
├── stripe-portal.ts       # Ouvre le portail de gestion d'abonnement Stripe
├── stripe-webhook.ts      # Vérifie la signature Stripe, traite les events (idempotent)
├── _shared/
│   ├── auth.ts             # userIdFromEvent : extrait le Bearer token, vérifie via Supabase
│   ├── supabaseAdmin.ts     # Client service_role (contourne RLS, jamais côté client)
│   ├── stripeStatus.ts      # Mapping des statuts Stripe → statuts internes
│   └── subscriptionUpsert.ts # applyStripeEvent : logique pure d'upsert (testée sans réseau)
└── __tests__/              # Tests des handlers (buildCheckout, buildPortal, processWebhook)

supabase/
├── migrations/
│   ├── 0001_profiles_streaks_sessions.sql
│   ├── 0002_functions.sql
│   └── 0003_billing_quotas.sql   # quotas, subscriptions, stripe_events, start_drill_session()
└── README.md               # Instructions d'application des migrations + variables d'env

vercel.json                 # Build command, rewrites SPA, headers de sécurité
tsconfig.api.json           # Typecheck de api/ (lib DOM ajoutée pour Request/Response)
```

## 4. Principes d'architecture à préserver absolument

Ces règles viennent du spec et ont été respectées strictement tout au long
du développement — ne pas les casser en reprenant la main :

1. **Le serveur décide, le client affiche.** Le quota de sessions gratuites
   (3/jour) est vérifié et décrémenté par la fonction Postgres
   `start_drill_session()` (`SECURITY DEFINER`), jamais par une logique
   client. Le client ne fait qu'afficher le résultat.
2. **Stripe est la seule source de vérité des abonnements.** La table
   `subscriptions` n'est écrite que par `api/stripe-webhook.ts`, via le
   client `service_role` (qui contourne RLS). Le code client ne fait que
   lire cette table (`SELECT` via une policy RLS dédiée), jamais écrire.
3. **Idempotence du webhook** via la table `stripe_events` : chaque
   `event.id` Stripe est inséré une seule fois (PK), un doublon échoue
   silencieusement → `{handled: false}`.
4. **Zéro secret dans le bundle client.** Seules les variables préfixées
   `VITE_` sont visibles côté navigateur. Toutes les clés serveur
   (Stripe secret key, service role key, etc.) ne vivent que dans les
   variables d'environnement Vercel, jamais dans le code.
5. **Zéro texte en dur dans l'UI.** Toute chaîne affichée passe par
   `t('clé.sous.clé')` et est définie dans `src/i18n/locales/fr.json`.
6. **TDD strict.** Chaque fonctionnalité a été écrite test-first (RED →
   GREEN), avec un commit par tâche. À reproduire pour toute nouvelle
   fonctionnalité.

## 5. Historique des phases (spec `docs/superpowers/specs/2026-07-05-cardcount-design.md`)

- **Phase 0** — Fondations : scaffold, qualité (ESLint/Prettier), tests,
  i18n, CI, déploiement (Netlify à l'origine, migré vers Vercel).
- **Phase 1** — Moteur Hi-Lo (`src/engine/`), 100% de couverture.
- **Phase 2** — Écrans de drill, profil local (progression anonyme).
- **Phase 3** — Auth Supabase, synchronisation de la progression serveur,
  migration de la progression anonyme à l'inscription.
- **Phase 4** — Monétisation : quotas serveur, 3 fonctions Stripe,
  paywall, statut premium. **Terminée et testée manuellement de bout en
  bout** (voir section 7, gotchas rencontrés pendant cette validation).
- **Phase 5** (non commencée) — Polish lancement : landing, onboarding,
  pages légales, emails transactionnels, SEO minimal.

## 6. État de la migration Netlify → Vercel (faite dans cette session)

**Ce qui est fait et poussé (commit `ff3d379`)** :
- `netlify/functions/` → `api/` (convention Vercel).
- Handlers réécrits du type Netlify `Handler` vers le format Web API
  standard (`export default async function handler(request: Request):
  Promise<Response>`), avec `export const config = { runtime: 'nodejs' }`.
  La logique métier pure (`buildCheckout`, `buildPortal`, `processWebhook`,
  `applyStripeEvent`) n'a **pas changé** — seul l'adaptateur HTTP diffère.
- `netlify.toml` → `vercel.json` (build command, rewrite SPA excluant
  `/api/*`, headers de sécurité).
- `tsconfig.functions.json` → `tsconfig.api.json` (ajout de `lib: ["DOM"]`
  pour typer `Request`/`Response`).
- Client : tous les appels `fetch('/.netlify/functions/...')` remplacés par
  `fetch('/api/...')` dans `src/lib/billingApi.ts`.
- `package.json` : suppression de `@netlify/functions`, script `typecheck`
  mis à jour.
- `README.md` et `supabase/README.md` : mentions Netlify → Vercel.

**Projet Vercel lié** : `mathisvrg-s-projects/cardcount`
(`.vercel/project.json` existe en local, gitignored — normal, chaque
machine doit relier elle-même via `vercel link --yes --project cardcount`).

**Variables d'environnement déjà configurées sur Vercel** (via CLI, pour
Production + Preview + Development) :
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_URL`

**Variables encore à ajouter sur Vercel** (secrets — à copier depuis le
dashboard Netlify où elles sont déjà configurées en clair, ou à
régénérer depuis Stripe/Supabase) :
- `SUPABASE_SERVICE_ROLE_KEY` (Supabase → Settings → API Keys → onglet
  "Legacy" → `service_role` → Reveal)
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_MONTHLY`
- `STRIPE_PRICE_YEARLY`
- `SITE_URL` (mettre l'URL Vercel définitive une fois le premier déploiement
  fait, ex. `https://cardcount.vercel.app`)

**Pas encore fait** :
- Connexion du repo GitHub au projet Vercel pour le déploiement automatique
  (`vercel link` a échoué sur cette étape — nécessite d'autoriser la
  Vercel GitHub App manuellement dans **Vercel → Project Settings → Git**).
- Premier déploiement effectif sur Vercel.
- Recréation du webhook Stripe pointant vers
  `https://<url-vercel>/api/stripe-webhook` (événements :
  `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`) — l'ancien pointe encore vers Netlify.
- Test de bout en bout sur Vercel (inscription → 3 sessions → paywall →
  paiement carte test → statut premium → portail).

Le site Netlify (`cardcountj.netlify.app`) reste fonctionnel entre-temps
si besoin de comparer/déboguer (toutes ses variables d'env y sont déjà
correctement configurées, après plusieurs corrections — voir section 7).

## 7. Pièges rencontrés (ne pas reproduire)

1. **Confirmation email + rate limit Supabase.** Le service SMTP intégré
   de Supabase a un plafond d'envoi très bas. Avec "Confirm email" actif,
   quelques tentatives d'inscription suffisent à tout bloquer (`429
   over_email_send_rate_limit`). Pour le MVP, "Confirm email" a été
   désactivé (Supabase → Authentication → Sign In / Providers). Il faudra
   un SMTP custom (Resend, SendGrid...) avant un vrai lancement public.
2. **Un commit parasite a cassé le webhook Stripe.** À un moment, un outil
   (probablement un assistant de configuration Netlify/Stripe côté
   dashboard) a remplacé notre vraie implémentation `stripe-webhook.ts`
   (vérification de signature + idempotence) par une fonction Netlify
   par défaut ("Hello World"). Repéré via la CI qui a viré rouge, corrigé
   en restaurant depuis l'historique git (commit `5f68e94`). **Vigilance
   à garder** : ne jamais laisser un outil tiers commiter directement sans
   relire le diff.
3. **Détection automatique des fonctions.** Netlify traite tout fichier
   `.ts` directement à la racine de `netlify/functions/` comme une
   fonction déployable — y compris les fichiers `*.test.ts` (points
   interdits dans un nom de fonction). Fix : déplacer les tests dans un
   sous-dossier `__tests__/`. Cette convention a été conservée dans `api/`
   pour Vercel (qui exclut les dossiers préfixés `_`/`__` du routing), donc
   pas de souci côté Vercel, mais bon à savoir si un jour on inspecte les
   deux structures.
4. **Faute de frappe dans une variable d'env = échec silencieux.** Un
   `SUPABASE_URL` mal recopié (`feinwygmaoijvrsbjwyie` au lieu de
   `feinwygmaoijvsrbjwle`) a fait échouer toutes les fonctions Stripe côté
   Netlify avec un DNS `ENOTFOUND`, sans message clair côté client (401
   générique). Toujours vérifier lettre par lettre en copiant des clés de
   projet, ou les copier avec `vercel env pull`/`env ls` plutôt qu'à la
   main.
5. **Netlify (et Vercel) ne recharge pas les variables d'env sans nouveau
   déploiement.** Sauvegarder une variable dans le dashboard ne suffit
   pas : il faut redéployer (`Clear cache and deploy site` sur Netlify,
   ou un nouveau push/`vercel deploy` sur Vercel) pour qu'elle soit prise
   en compte par le build ET par les fonctions serverless.
6. **L'intégration Vercel Marketplace "Supabase" crée un NOUVEAU projet
   par défaut.** Elle ne connecte pas un projet Supabase existant — elle
   en provisionne un vide. Testé puis annulé dans cette session
   (`vercel integration resource disconnect` puis `remove`). Pour ce
   projet, la bonne méthode reste l'ajout manuel des variables
   d'environnement pointant vers le projet Supabase existant
   (`feinwygmaoijvsrbjwle`), pas l'intégration Marketplace.
7. **Le fichier `.env.local` généré par `vercel link`/l'intégration
   Marketplace a été supprimé** (il contenait des identifiants du projet
   Supabase fantôme créé par erreur). Le vrai `.env` local (avec les 2
   variables `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` correctes)
   n'a pas été touché et reste la référence pour le dev local.
8. **Prettier peut reformater après un commit.** Toujours lancer
   `git status --short` juste avant chaque commit pour rattraper les
   fichiers reformatés entre-temps (sinon la CI échoue sur `format:check`
   alors que le check local passe).

## 8. Ce qu'il reste à faire (dans l'ordre)

1. Ajouter les 6 variables d'environnement manquantes sur Vercel
   (section 6).
2. Connecter le repo GitHub au projet Vercel (dashboard, autorisation
   GitHub App) pour le déploiement automatique à chaque push.
3. Premier déploiement, récupérer l'URL finale, mettre à jour `SITE_URL`
   et redéployer.
4. Recréer le webhook Stripe vers `/api/stripe-webhook` sur la nouvelle
   URL, mettre à jour `STRIPE_WEBHOOK_SECRET`.
5. Test de bout en bout complet (voir section 6).
6. Une fois Vercel validé, décider si le site Netlify doit être supprimé
   ou juste laissé à l'abandon (pas fait automatiquement — action
   destructive à valider explicitement).
7. Envisager `vercel dev` en local pour émuler les fonctions serverless
   sans redéployer à chaque test (contrairement à Netlify, dont le
   `npm run dev` local ne proxait pas `/api/*`, ce qui avait causé des
   confusions pendant les tests de Phase 4).
8. Phase 5 (non commencée) : landing, onboarding, pages légales, emails
   transactionnels, SEO minimal — voir le spec pour le détail.

## 9. Commandes utiles

```bash
npm run dev              # Serveur de développement Vite
npm run build             # Build de production
npm run test              # Tests (Vitest, mode run) — 162 tests actuellement
npm run test:coverage     # Tests avec couverture (seuils bloquants)
npm run lint               # oxlint
npm run typecheck          # tsc -b + tsc -p tsconfig.api.json (couvre src/ et api/)
npm run format:check       # Prettier (utilisé par la CI)

# Vercel CLI (déjà lié à ce projet)
npx vercel env ls          # Liste les variables (noms seulement, jamais les valeurs)
npx vercel env pull        # Récupère les variables en local (.env.local, gitignored)
npx vercel deploy          # Déploiement preview
npx vercel deploy --prod   # Déploiement production
```
