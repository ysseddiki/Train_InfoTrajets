# Delta for Ingest

## ADDED Requirements

### Requirement: Ingest via adapter unique

Le pipeline d’ingest SHALL utiliser un port `DisruptionIngestPort` avec une implémentation active à la fois (`stub` en dev, `prim` ou `navitia` en prod).

#### Scenario: Mode stub

- **GIVEN** `INGEST_PROVIDER=stub`
- **WHEN** le worker tourne
- **THEN** des événements synthétiques peuvent être produits pour tester matching et notifications

### Requirement: Matching Aller/Retour

Chaque `DisruptionEvent` MUST être rattaché au sens `outbound` ou `inbound` selon la ressource et la fenêtre horaire du trajet, ou ignoré s’il ne match aucun sens.

#### Scenario: Retard sur fenêtre Aller

- **GIVEN** un trajet Aller 07:00–09:30 lun–ven et seuil 10 min
- **WHEN** un retard de 15 min survient sur ce trajet un mardi à 08:00
- **THEN** une notification est déclenchée pour le sens `outbound`

### Requirement: Retard inconnu (`delay_minutes` null)

Quand la durée de retard n’est pas connue côté source, l’ingest MUST persister `delay_minutes = null` et MUST NOT la coercer en `0`. La valeur sémantique est **unknown** : UI et notifications MUST l’afficher comme `unknown`.

Le seuil `min_delay_minutes` MUST s’appliquer uniquement lorsque `delay_minutes` est un entier connu. Un événement `kind = delay` avec `delay_minutes` null MUST rester éligible au matching.

#### Scenario: Durée absente

- **GIVEN** une perturbation de type retard sans durée exploitable
- **WHEN** l’ingest normalise l’événement
- **THEN** `delay_minutes` est `null`
- **AND** le dashboard / les notifs affichent un retard `unknown`
