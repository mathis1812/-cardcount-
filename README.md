# CardCount

App SaaS d'entraînement au comptage de cartes (Hi-Lo) au blackjack, façon
Duolingo — marché FR/EU.

Spec de conception : [docs/superpowers/specs/2026-07-05-cardcount-design.md](docs/superpowers/specs/2026-07-05-cardcount-design.md)

## Stack

Vite + React + TypeScript (SPA) · Supabase (auth, Postgres, RLS) ·
Vercel (hébergement + Functions Stripe) · Stripe (abonnements)

## Prérequis

- Node.js ≥ 24, npm ≥ 11
- Un fichier `.env` local (copier `.env.example`) — optionnel en Phase 0-2

## Scripts

| Script                  | Rôle                                     |
| ----------------------- | ---------------------------------------- |
| `npm run dev`           | Serveur de développement                 |
| `npm run build`         | Build de production (`dist/`)            |
| `npm run test`          | Tests (Vitest, mode run)                 |
| `npm run test:coverage` | Tests avec couverture (v8)               |
| `npm run lint`          | Lint (oxlint)                            |
| `npm run typecheck`     | Vérification TypeScript (`tsc --noEmit`) |
| `npm run format`        | Formatage Prettier                       |
| `npm run format:check`  | Vérification du formatage (CI)           |

## Variables d'environnement

Voir `.env.example` : `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`
(valeurs dans Supabase > Settings > API). Aucun secret côté client — les clés
secrètes (Stripe, service role) vivent dans les env vars Vercel.

## Structure

```
src/
├── engine/    # Moteur de jeu Hi-Lo (TS pur, zéro dépendance UI/réseau) — Phase 1
├── features/  # Écrans et composants par domaine — Phase 2+
├── i18n/      # react-i18next, locales (fr)
├── lib/       # Clients externes (Supabase)
└── test/      # Setup de test
```
