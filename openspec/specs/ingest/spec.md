# Ingest Specification

## Purpose

Ingestion des perturbations SNCF via un adapter unique (stub / PRIM / Navitia) et matching sur les trajets Aller et Retour.

## Requirements

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

### Requirement: Idempotence ingest

L’ingest MUST être idempotent sur `external_event_id` (pas de doublon d’événement source).

#### Scenario: Retransmission

- **GIVEN** un événement déjà stocké pour `external_event_id = X`
- **WHEN** la source renvoie `X`
- **THEN** l’enregistrement existant est mis à jour, pas dupliqué

### Requirement: Retard inconnu (`delay_minutes` null)

Quand la durée de retard n’est pas connue côté source, l’ingest MUST persister `delay_minutes = null` et MUST NOT la coercer en `0`. La valeur sémantique est **unknown** : UI et notifications MUST l’afficher comme `unknown` (jamais comme `0 min`, `—` ou une omission ambiguë pour un événement de type `delay`).

Le seuil `min_delay_minutes` MUST s’appliquer uniquement lorsque `delay_minutes` est un entier connu. Un événement `kind = delay` avec `delay_minutes` null MUST rester éligible au matching (le retard est affirmé, sa durée non).

#### Scenario: Durée absente

- **GIVEN** une perturbation de type retard sans durée exploitable
- **WHEN** l’ingest normalise l’événement
- **THEN** `delay_minutes` est `null`
- **AND** le dashboard / les notifs affichent un retard `unknown`

#### Scenario: Seuil avec durée connue

- **GIVEN** un trajet avec `min_delay_minutes = 10`
- **WHEN** un retard de 5 min est ingéré
- **THEN** l’événement ne passe pas le matching (sous seuil)

### Requirement: Fenêtre de veille vs fenêtre trajet

La `time_window` d’un `JourneyConfig` MUST représenter la fenêtre **trajet** (prise de train). Le poll ingest et l’éligibilité board/notif MUST utiliser la **fenêtre de veille** :

- si `watch_always = true` : veille sur les `days_of_week` configurés, sans borne horaire
- sinon : de `time_window.start − watch_lead_hours` jusqu’à `time_window.end` (TZ `Europe/Paris`), avec `watch_lead_hours` ∈ [0, 12] (défaut 4)

`watch_lead_hours` MUST être ignoré pour le calcul de veille lorsque `watch_always` est vrai (valeur conservée pour réactivation).

#### Scenario: Lead 4 h

- **GIVEN** Aller actif, fenêtre trajet 07:00–09:30, `watch_always = false`, `watch_lead_hours = 4`
- **WHEN** il est mardi 04:30 Europe/Paris
- **THEN** l’ingest poll ce sens (veille commencée)

#### Scenario: Veille continue

- **GIVEN** Retour actif, `watch_always = true`, jours lun–ven
- **WHEN** il est mercredi 14:00 (hors fenêtre trajet)
- **THEN** l’ingest poll ce sens et le board n’est pas `outside_window` pour cause d’heure
