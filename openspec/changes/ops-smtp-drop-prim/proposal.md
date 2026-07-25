# Proposal: Drop PRIM, SMTP en DB, autocomplete gares, ZOU durci

## Why

- PRIM (Île-de-France) est hors périmètre ops TER Sud — provider inutile.
- Secrets SMTP encore dans `.env` alors que l’ingest est déjà configurable en admin.
- Sélection gare liaison = `<select>` ; filtre catalogue Entrée existe, manque un autocomplete Entrée sur le picker liaison.
- Failover ZOU : TripUpdates express souvent vides sur Nice↔Monaco — renforcer matching (stop_times static + multi-feeds) et logs.

Ne plus documenter une liste « hors scope / prochaines améliorations » dans le README.

## What Changes

- **REMOVED** : provider `prim` (UI, probe, poll, slots admin)
- **ADDED** : `PUT /v1/admin/channels/smtp` — config SMTP en `app_meta` (password write-only) ; bootstrap depuis `.env` si vide
- **ADDED** : autocomplete gares (LiaisonForm) — saisie + Entrée pour valider
- **MODIFIED** : index GTFS ZOU + `stop_times` ; merge multi TripUpdates URLs ; matching dest via parcours static
- **MODIFIED** : README / baseline / specs (plus de section PRIM / TODOs restants)

## Impact

- MODIFIED : shared, store, admin routes, notifiers, ingest, web admin, ZOU adapters, OpenSpec
- REMOVED : PRIM comme provider actif
