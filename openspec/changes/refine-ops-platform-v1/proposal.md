# Proposal: Refine Ops Platform v1

## Why

La baseline initiale décrivait un produit B2C voyageur (comptes multi-users, push, quiet hours personnelles). Le besoin réel est un **outil ops interne** : surveillance de **deux trajets Aller/Retour**, dashboard de lecture, console admin authentifiée, notifications **Email (SMTP custom)** et **Teams**.

## What Changes

- Pivot produit : B2C → **ops interne**, un seul acteur v1 = **admin**
- Surfaces : **Dashboard** (sans login, réseau trusté) + **Console admin** (login simple)
- Trajets : exactement **Aller** et **Retour** configurables
- Canaux : **SMTP custom** + **Teams** ; destinataires mail saisis dans l’UI admin
- Architecture : monorepo `apps/web` (client) + `apps/api` (serveur) + `packages/shared`
- Privacy : pas de PII inutile ; secrets hors git ; masquage des credentials dans l’API
- OpenSpec : specs par domaine + règles `.cursor` (global + domaines)
- Hors scope v1 : inscription users voyageurs, SSO, push, multi-trajets au-delà A/R

## Impact

- **MODIFIED** : vision système, modèles, API, notifications, auth
- **ADDED** : domaines dashboard, admin, ingest ops, privacy/security
- **REMOVED** : comptes voyageurs, canal push, quiet hours individuelles, abonnements multi-user

## Approach

1. Écrire design + deltas OpenSpec
2. Réécrire `specs/system/baseline-v1.md` comme baseline ops
3. Poser le squelette monorepo + `.env.example` + README clés API
4. Ajouter règles Cursor globales et par domaine
