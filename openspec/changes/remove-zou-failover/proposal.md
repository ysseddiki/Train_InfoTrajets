# Proposal: Retrait failover ZOU

## Why

Le failover GTFS-RT ZOU n’est plus un filet de secours souhaité. L’ingest v1 reste **stub | Navitia** uniquement.

## What Changes

- **REMOVED** : adapters GTFS-RT / GTFS static ZOU, toggle `zouFailoverEnabled`, poll failover, logs debug `zou`, deps `gtfs-realtime-bindings` / `fflate`
- **KEPT** : `source = zou` en lecture / clear-stats (legacy, comme `prim`) pour purger d’anciens événements
- Board : snapshots `navitia` seulement ; snapshots `zou` ignorés comme stub / G&C

## Impact

- **MODIFIED** : ingest, admin, dashboard, system, baseline
- **REMOVED** : requirement Failover GTFS-RT ZOU
