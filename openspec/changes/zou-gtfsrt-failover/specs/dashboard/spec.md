## MODIFIED Requirements

### Requirement: Board prochain train

Les snapshots board affichés MUST provenir de `navitia` ou, en failover, de `zou`. Les sources `stub` et `garesetconnexions` MUST être ignorées.

#### Scenario: Snapshot ZOU

- **GIVEN** un snapshot `source = zou` écrit par le failover
- **WHEN** le dashboard charge l’overview
- **THEN** `nextDeparture` est exposé pour ce journey
