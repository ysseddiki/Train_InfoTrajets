# Delta for Ingest

## REMOVED Requirements

### Requirement: Failover GTFS-RT ZOU (open data)

## MODIFIED Requirements

### Requirement: Pas de failover scrape Gares & Connexions

Le pipeline d’ingest MUST NOT scraper Gares & Connexions ni exposer une source `garesetconnexions`. MUST NOT interroger les flux GTFS-RT / GTFS ZOU. En cas d’échec Navitia (token manquant, quota, erreur API), le poll MUST enregistrer un statut `error` ou `skipped` et MUST NOT basculer vers une autre source board.

#### Scenario: Navitia KO

- **GIVEN** provider actif `navitia`, token invalide ou API en erreur
- **WHEN** le poll tourne
- **THEN** `last_ingest_status` est `error` (ou `skipped` si hors fenêtre / quota)
- **AND** aucun appel HTTP vers `garesetconnexions.sncf` ni vers les flux ZOU n’est effectué

### Requirement: Board prochain train sans stub

Les snapshots `journey_board_snapshots` affichés sur le dashboard MUST provenir de `navitia`. Le provider stub MUST NOT écrire ni exposer de prochain train sur le board. Les snapshots historiques `source=garesetconnexions` et `source=zou` MUST être ignorés (comme le stub).

#### Scenario: Snapshot ZOU ignoré

- **GIVEN** un snapshot `source=zou` en base
- **WHEN** le dashboard charge l’overview
- **THEN** ce snapshot n’est pas exposé comme `nextDeparture`

### Requirement: Motif de retard optionnel

L’ingest SHALL persister `delay_reason` (texte affichable) et `delay_reason_key` (clé de regroupement stats) quand Navitia en fournit, sinon `null`. MUST NOT inventer un motif.

#### Scenario: Navitia avec disruption

- **GIVEN** un départ Navitia lié à une disruption « travaux »
- **WHEN** un retard éligible est ingéré
- **THEN** `delay_reason_key` reflète la cause / catégorie
- **AND** `delay_reason` MAY contenir le message
