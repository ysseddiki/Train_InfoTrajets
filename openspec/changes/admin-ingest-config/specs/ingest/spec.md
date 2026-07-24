# Delta for Ingest

## MODIFIED Requirements

### Requirement: Ingest via adapter unique

Le pipeline d’ingest SHALL utiliser un port `DisruptionIngestPort` avec une implémentation active à la fois (`stub`, `prim` ou `navitia`), choisie via la **config admin** (`provider`), pas via `INGEST_PROVIDER` env comme source de vérité.

#### Scenario: Mode stub

- **GIVEN** provider admin = `stub`
- **WHEN** le worker tourne
- **THEN** aucun appel externe n’est requis ; des événements synthétiques peuvent être injectés via debug admin
