# Delta for Ingest

## ADDED Requirements

### Requirement: Pas de failover scrape Gares & Connexions

Le pipeline d’ingest MUST NOT scraper Gares & Connexions ni exposer un provider / source `garesetconnexions`. En cas d’échec Navitia (token manquant, quota, erreur API), le poll MUST enregistrer un statut d’erreur ou `skipped` et MUST NOT basculer vers un board HTML tiers.

#### Scenario: Navitia KO

- **GIVEN** provider actif `navitia` et token invalide ou API en erreur
- **WHEN** le poll tourne
- **THEN** `last_ingest_status` est `error` (ou `skipped` si hors fenêtre / quota)
- **AND** aucun appel HTTP vers `garesetconnexions.sncf` n’est effectué

## MODIFIED Requirements

### Requirement: Board prochain train sans stub

Les snapshots `journey_board_snapshots` affichés sur le dashboard MUST provenir de `navitia`. Le provider stub MUST NOT écrire ni exposer de prochain train sur le board. Les snapshots historiques `source=garesetconnexions` MUST être ignorés (comme le stub).

#### Scenario: Stub désactivé

- **GIVEN** des snapshots `source=stub` en base et provider actif ≠ stub
- **WHEN** le dashboard charge l’overview
- **THEN** `nextDeparture` est absent pour ces journeys (stub ignoré / purgé)

#### Scenario: Ancien snapshot G&C

- **GIVEN** un snapshot `source=garesetconnexions` en base
- **WHEN** le dashboard charge l’overview
- **THEN** `nextDeparture` est absent pour ce journey
