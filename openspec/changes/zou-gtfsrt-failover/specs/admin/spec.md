## MODIFIED Requirements

### Requirement: Config ingest multi-providers

Un admin authentifié SHALL pouvoir activer un failover optionnel `zouFailoverEnabled` (GTFS-RT ZOU) indépendamment du provider actif. MUST NOT proposer un scrape G&C.

#### Scenario: Toggle failover ZOU

- **GIVEN** un admin connecté
- **WHEN** il active « Failover GTFS-RT ZOU »
- **THEN** `GET /v1/admin/ingest` renvoie `zouFailoverEnabled: true`

### Requirement: Clear stats sélectif

Un admin authentifié SHALL pouvoir effacer les événements `stub`, `navitia`, `prim`, `zou` et/ou les livraisons. MUST NOT proposer `garesetconnexions`.

#### Scenario: Clear ZOU

- **GIVEN** des événements `source = zou`
- **WHEN** clear-stats avec `eventSources: ["zou"]`
- **THEN** ces événements (et livraisons liées) sont supprimés
