# Delta for Dashboard

## MODIFIED Requirements

Les snapshots board affichés MUST provenir de `navitia`. Les sources `stub`, `garesetconnexions` et `zou` MUST être ignorées.

#### Scenario: Snapshot ZOU ignoré

- **GIVEN** un snapshot `source = zou` en base
- **WHEN** le dashboard charge l’overview
- **THEN** `nextDeparture` n’utilise pas ce snapshot
