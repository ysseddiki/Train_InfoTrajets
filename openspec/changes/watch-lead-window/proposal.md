# Proposal: Fenêtre de veille (lead / continue)

## Why

La `time_window` décrit quand l’ops **prend le train**. Les retards / suppressions sont souvent annoncés **avant**. Aujourd’hui poll, board et matching sont coupés hors fenêtre trajet → pas de statut anticipé.

## What Changes

- Découpler **fenêtre trajet** (`time_window`) et **fenêtre de veille**
- Par sens : `watch_always` (bool) **ou** `watch_lead_hours` (0–12, défaut 4)
- UI admin : checkbox « Veille continue » + liste 0–12 h (grisée si continue)
- Ingest / board / matching notif utilisent la fenêtre de veille ; `time_window` reste l’ancre trajet

## Impact

- **MODIFIED** : `JourneyConfig`, ingest, admin, dashboard (libellé veille)
- Migration DB : colonnes `watch_always`, `watch_lead_hours`
