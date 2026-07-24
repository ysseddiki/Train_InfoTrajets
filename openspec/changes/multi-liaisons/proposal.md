# Proposal: Multi-liaisons

## Why

Le produit fixe « exactement 2 trajets » ne couvre plus le besoin ops : plusieurs paires A/R (ex. Nice↔Monaco et une autre ligne) avec un nommage clair.

## What Changes

- Entité **Liaison** (paire Aller/Retour) : N liaisons, au moins une
- Nom custom ou auto `départ <-> arrivée`
- API admin `GET/POST/PUT/DELETE /v1/admin/liaisons`
- Dashboard : une section par liaison
- Matching/ingest tague `journeyId` + `liaisonId`

## Impact

- **MODIFIED** : baseline « 2 trajets » → liaisons multiples
- Schéma DB + migration depuis l’ancien PK `direction`
