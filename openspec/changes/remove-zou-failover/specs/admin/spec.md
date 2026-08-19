# Delta for Admin

## MODIFIED Requirements

### Requirement: Configuration ingest en admin

Un admin authentifié SHALL pouvoir configurer **indépendamment** les providers `stub` et `navitia`, puis choisir le provider **actif** via `GET/PUT /v1/admin/ingest`.

MUST NOT exposer de toggle failover ZOU ni de provider `prim`.

#### Scenario: Pas de toggle ZOU

- **GIVEN** un admin sur Ingest
- **WHEN** `GET /v1/admin/ingest` est appelé
- **THEN** la réponse n’inclut pas `zouFailoverEnabled`

### Requirement: Clear stats par source

Un admin authentifié SHALL pouvoir effacer les données de statistiques dashboard en sélectionnant indépendamment les sources : événements `stub`, `navitia`, `zou` (legacy), `prim` (legacy), et/ou livraisons email/Teams.

#### Scenario: Clear événements stub seulement

- **GIVEN** un admin authentifié
- **WHEN** il envoie `POST /v1/admin/stats/clear` avec `eventSources: ["stub"]`
- **THEN** seuls les événements `source=stub` (et livraisons liées) sont supprimés
- **AND** les événements Navitia restent
