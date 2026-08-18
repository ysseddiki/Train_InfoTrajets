# Proposal: Palier de re-notif + motifs de retard (stats)

## Why

Un retard évolue (12 min → 18 → 25) : aujourd’hui une seule notif au premier insert. Ops veut un **palier configurable** (ex. +5 min) et des **stats de motifs** quand Navitia / ZOU en fournissent.

## What Changes

- `notify_step_minutes` par trajet (admin, défaut 5, 0 = pas de re-notif sur la durée)
- Re-notif si le retard a augmenté d’au moins le palier **depuis la dernière notif**, ou hausse de sévérité / passage suppression
- `delay_reason` / `delay_reason_key` optionnels (best-effort) ; agrégats dashboard
- Navitia : `disruptions` liées au départ ; ZOU : Service Alert **seulement** si `trip_id` match (pas d’événement créé depuis l’alerte)

## Impact

- **MODIFIED** : ingest, notifications, admin, dashboard, baseline
