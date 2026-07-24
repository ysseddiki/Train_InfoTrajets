## 1. Implementation

- [x] 1.1 Adapter GTFS-RT ZOU (TripUpdates + Service Alerts) + cache GTFS static (stops/trips)
- [x] 1.2 Brancher failover dans `NavitiaDeparturesAdapter.poll` (miroir ancien G&C)
- [x] 1.3 Meta `ingest_zou_failover_enabled` + `IngestConfigPublic.zouFailoverEnabled`
- [x] 1.4 Admin checkbox + clear-stats source `zou`
- [x] 1.5 OpenSpec / baseline / rules

## 2. Validation

- [x] 2.1 Typecheck api + web
- [x] 2.2 Probe manuel feed TripUpdates (réseau) — OK ; Nice↔Monaco = SA corridor ; TripUpdates MCN selon couverture feed
