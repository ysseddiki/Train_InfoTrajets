# Proposal: Failover GTFS-RT ZOU (Région Sud)

## Why

Navitia (quota / token / API) peut être indisponible. Le scrape G&C a été retiré (Datadome). L’open data **Trains régionaux ZOU !** (GTFS + GTFS-RT TripUpdates / Service Alerts) fournit un filet de secours licence ouverte, sans secret.

## What Changes

- **ADDED** : failover optionnel `zouFailoverEnabled` (défaut OFF) — bascule si Navitia KO / quota / sans token
- **ADDED** : source événements / board `zou` (TripUpdates + Service Alerts)
- **ADDED** : matching par UIC (`stop_area:SNCF:87xxxxxx` ↔ `stop_point:MCN:87xxxxxx` / zone_id GTFS)
- **KEPT** : pas de scrape G&C ; ZOU n’est **pas** un provider primaire sélectionnable
- Clear stats : option `zou`

## Impact

- **MODIFIED** : ingest poll, Admin Ingest, clear-stats, shared types, board snapshots
- Env optionnels : `ZOU_GTFS_URL`, `ZOU_GTFSRT_TRIPS_URL`, `ZOU_GTFSRT_SA_URL`
