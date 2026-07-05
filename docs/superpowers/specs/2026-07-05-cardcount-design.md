# CardCount — Design de fondation (MVP)

Date : 2026-07-05
Statut : validé en session de brainstorming

## 1. Vision produit

CardCount est une web app SaaS d'entraînement au comptage de cartes (Hi-Lo) au
blackjack, façon Duolingo : sessions courtes, progression par paliers, XP,
niveaux et streak quotidien. Marché cible : FR/EU, créneau vide (les
concurrents — Blackjack Apprenticeship, Card Counting Coach, Card Counter —
sont anglophones, orientés US, en achat unique ou freemium avec pub, sans
modèle abonnement ni gamification moderne).

Contexte d'exécution : solo entrepreneur, build sur Claude Code, exécution des
tâches déléguée à des modèles économiques. La simplicité et l'isolation des
modules sont des contraintes de premier ordre.

## 2. Décisions de cadrage

| Sujet | Décision |
|---|---|
| Cœur du MVP | Drill de comptage pur (running count Hi-Lo), une seule mécanique très polie |
| Plateforme | Web desktop d'abord (SPA), responsive plus tard |
| Monétisation | Freemium limité par usage : 3 sessions/jour gratuites (valeur configurable en base), abonnement pour l'illimité |
| Prix | ~7-10 €/mois + plan annuel réduit (~-40 %), deux prix Stripe |
| Gamification MVP | XP + niveaux, streak quotidien. Leaderboards et badges : post-MVP |
| Funnel | Essai anonyme immédiat (state local), compte requis pour sauvegarder la progression |
| Langue | FR uniquement au lancement, i18n structuré dès le départ (react-i18next, zéro texte en dur) |

## 3. Architecture technique (approche retenue : SPA statique)

```
Netlify (statique + Functions)
├── SPA Vite + React + TypeScript
│   ├── Drill engine : module TS pur (src/engine/), zéro dépendance UI/réseau
│   ├── State : Zustand (local/jeu) + TanStack Query (données Supabase)
│   └── i18n : react-i18next, clés FR
└── Netlify Functions (3)
    ├── stripe-checkout   — création de session de paiement
    ├── stripe-webhook    — source de vérité des abonnements
    └── stripe-portal     — portail client Stripe

Supabase
├── Auth : email/password + Google OAuth
├── Postgres + RLS : profiles, drill_sessions, streaks, subscriptions, daily_usage
└── Fonctions Postgres : record_activity, start_drill_session, is_premium
```

Alternatives écartées : Next.js full-stack (complexité SSR risquée pour
l'exécution déléguée, overkill pour un jeu client-side) ; Astro + îlot React
(deux paradigmes, frontière d'état auth/quotas pénible au stade MVP). Le SEO
de la landing sera traité post-MVP par prerendering ou landing statique
dédiée, sans refonte.

### Principes structurants

- **Drill engine isolé** : mélange de deck, valeurs Hi-Lo, running count,
  paliers, scoring — 100 % testable unitairement, aucune dépendance UI/réseau.
- **Essai anonyme** : même engine, état en localStorage. À l'inscription,
  migration unique de l'XP anonyme vers le profil, plafonnée (anti-triche).
- **Quotas appliqués côté serveur** : `start_drill_session` (fonction
  Postgres) refuse au-delà du quota si non-abonné. Le client affiche, le
  serveur décide.
- **Stripe = seule logique serveur** : le webhook écrit `subscriptions`
  (service role) ; jamais de statut d'abonnement décidé côté client.
- **Sécurité** : uniquement anon key Supabase + clé publique Stripe côté
  client ; secrets dans les env vars Netlify ; RLS sur toutes les tables.

## 4. Modèle de données

Toutes les tables sous RLS (l'utilisateur ne voit que ses lignes).

### profiles (trigger à l'inscription, extension d'auth.users)
```
id uuid PK → auth.users, username text unique, xp_total bigint default 0,
level int default 1 (dénormalisé), locale text default 'fr', created_at
```

### drill_sessions (une ligne par session terminée)
```
id uuid PK, user_id → profiles, mode text ('running_count' au MVP),
difficulty jsonb (config figée : speed_ms, deck_count, …), cards_seen int,
correct boolean, accuracy numeric, duration_ms int, xp_earned int, created_at
```
Insertion en fin de session uniquement. XP calculée client mais bornée par
CHECK + trigger serveur (max par session).

### streaks (un enregistrement par utilisateur)
```
user_id PK → profiles, current_streak int, longest_streak int,
last_activity_on date, timezone text default 'Europe/Paris'
```
Logique streak en base via `record_activity(user_id)` (jour civil dans le
fuseau utilisateur), appelée en fin de drill.

### daily_usage (application du quota free)
```
PK (user_id, day), sessions_used int
```
Incrémenté par `start_drill_session(user_id)` qui lève une exception si quota
atteint et `is_premium(user_id)` faux.

### subscriptions (miroir Stripe, écrit uniquement par le webhook)
```
user_id PK → profiles, stripe_customer_id, stripe_sub_id,
status ('active'|'trialing'|'past_due'|'canceled'),
plan ('monthly'|'yearly'), current_period_end timestamptz
```
RLS : lecture seule utilisateur, écriture service role.

Volontairement absents du MVP : leaderboards, badges, arbre de leçons,
historique carte par carte. Le schéma les accueille par ajouts (nouveaux
`mode`, tables additives), sans migration destructive.

## 5. Boucle de jeu, XP et difficulté

### Drill (mode running_count)
1. Config de session issue du palier courant (vitesse, decks, nb de cartes).
2. Les cartes défilent une par une (ex. 1 carte/800 ms), sans interaction.
3. Saisie du running count final (clavier : flèches ou saisie directe).
4. Feedback : correct/incorrect, count attendu, **rejeu pédagogique** du deck
   avec valeurs Hi-Lo révélées carte par carte.

### Checkpoints
Aux paliers supérieurs, 2-3 interruptions demandent le count intermédiaire —
alimente `accuracy`, empêche de deviner le résultat final.

### Difficulté : 10 paliers fixes
Du palier 1 (20 cartes, 1200 ms) au palier 10 (104 cartes / 2 decks, 400 ms,
checkpoints). Déblocage : 3 sessions réussies du palier courant. Pas de
réglage libre au MVP (option premium future).

### XP et niveaux
- `xp = base_palier × multiplicateur_réussite`, +10 % si streak actif.
  Session ratée = petite XP de participation. Bornes max côté serveur.
- Niveaux : `xp_requis(n) = 100 × n^1.5` (arrondi). Cosmétique au MVP (titre
  + barre) ; la vraie progression est le palier de difficulté, découplé.

### Streak
Un jour compte si ≥ 1 session terminée. Au MVP : affichage seul. Post-MVP :
rappel email quotidien (cron).

## 6. Gestion des erreurs

- Fin de session hors-ligne / erreur réseau : la session est mise en file
  locale (localStorage) et resoumise au retour du réseau ; l'UI n'est jamais
  bloquée par la sync.
- Refus de quota (`start_drill_session`) : erreur typée → écran paywall, pas
  de message technique.
- Webhook Stripe : idempotent (traitement par event id), signature vérifiée,
  réponse 200 uniquement après écriture en base.
- Divergence client/serveur sur l'XP : le serveur (triggers/bornes) fait foi.

## 7. Stratégie de test

- **Engine (phase 1)** : TDD strict, couverture ~100 % — déterminisme via
  seed du mélange, tables de vérité Hi-Lo, propriétés (le count final d'un
  deck complet = 0).
- **Fonctions Postgres** : tests SQL (pgTAP ou scripts de test Supabase)
  pour quotas, streaks, bornes XP.
- **Fonctions Stripe** : tests d'intégration avec Stripe CLI (mode test).
- **UI** : React Testing Library sur les flux critiques (drill complet,
  inscription, paywall). Cible globale ≥ 80 %.

## 8. Phases d'exécution

Chaque phase est indépendamment testable et livre un résultat visible ;
chacune fera l'objet d'un plan détaillé (writing-plans) au moment de
l'attaquer.

- **Phase 0 — Fondations** : git, Vite + React + TS, ESLint/Prettier, Vitest,
  react-i18next, déploiement Netlify vide, projet Supabase.
  Critère : CI verte, « Hello CardCount » en ligne.
- **Phase 1 — Drill engine (TS pur)** : deck, Hi-Lo, running count, paliers,
  scoring, checkpoints. TDD strict.
- **Phase 2 — UI du drill anonyme** : écran de jeu, défilement, saisie,
  feedback + rejeu, localStorage. Critère : jouable en ligne sans compte.
- **Phase 3 — Comptes & progression** : auth Supabase, schéma + RLS +
  fonctions Postgres, migration XP anonyme, affichage profil/XP/streak.
- **Phase 4 — Monétisation** : quotas serveur, 3 Netlify Functions Stripe,
  paywall/pricing, portail client. Critère : paiement test de bout en bout.
- **Phase 5 — Polish lancement** : landing, onboarding, pages légales
  (CGV/confidentialité), emails transactionnels, SEO minimal.

## 9. Hors périmètre MVP (rappel)

Mobile/PWA, leaderboards, badges, arbre de leçons complet (stratégie de base,
true count, déviations, paris), réglage libre de difficulté, rappels email,
langues supplémentaires, apps natives.
