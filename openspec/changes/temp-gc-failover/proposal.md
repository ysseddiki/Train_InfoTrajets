# Proposal: TEMP failover scrape Gares & Connexions

## Why

Quand la clé API Navitia/PRIM tombe ou le quota est saturé, ops a besoin d’un filet de secours temporaire basé sur le board public G&C (lien `display_url` par gare).

## What Changes

- Toggle Admin → Ingest : `gcFailoverEnabled` (OFF par défaut)
- Si API active KO / sans token / quota : scrape `/fr/train-times/{UIC}/departure` (+ fiche gare)
- Source événements : `garesetconnexions` (clear stats dédié)

## Rollback

1. Désactiver le toggle (immédiat)
2. Supprimer `departures-garesetconnexions.ts` + branches failover dans `ingest.ts`
3. Retirer `gcFailoverEnabled` / source `garesetconnexions`
