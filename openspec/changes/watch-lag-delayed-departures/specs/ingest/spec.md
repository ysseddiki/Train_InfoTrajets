# Delta for Ingest

## MODIFIED Requirements

### Requirement: Fenêtre de veille vs fenêtre trajet

La `time_window` d’un `JourneyConfig` MUST représenter la fenêtre **trajet** (prise de train). Le poll ingest et l’éligibilité board/notif MUST utiliser la **fenêtre de veille** :

- si `watch_always = true` : veille sur les `days_of_week` configurés, sans borne horaire
- sinon : de `time_window.start − watch_lead_hours` jusqu’à `time_window.end + 2 h` (TZ `Europe/Paris`), avec `watch_lead_hours` ∈ [0, 12] (défaut 4)

Le lag de 2 h après `time_window.end` MUST permettre de suivre un train dont l’heure théorique est dans la fenêtre trajet mais dont l’heure réelle n’est pas encore échue (retard croissant). Après `time_window.end`, un départ dont l’heure théorique est **hors** fenêtre trajet MUST NOT être éligible (pas les trains suivants).

`watch_lead_hours` MUST être ignoré pour le calcul de veille lorsque `watch_always` est vrai (valeur conservée pour réactivation).

#### Scenario: Lead 4 h

- **GIVEN** Aller actif, fenêtre trajet 07:00–09:30, `watch_always = false`, `watch_lead_hours = 4`
- **WHEN** il est mardi 04:30 Europe/Paris
- **THEN** l’ingest poll ce sens (veille commencée)

#### Scenario: Lag après fin de trajet

- **GIVEN** Aller actif, fenêtre 07:00–09:30, pas de veille continue
- **WHEN** il est mardi 10:00 Europe/Paris
- **THEN** l’ingest poll encore ce sens (lag 2 h)
- **AND** un train théorique 09:20 retardé à 10:15 reste éligible
- **AND** un train théorique 10:20 n’est pas éligible

#### Scenario: Veille continue

- **GIVEN** Retour actif, `watch_always = true`, jours lun–ven
- **WHEN** il est mercredi 14:00 (hors fenêtre trajet)
- **THEN** l’ingest poll ce sens et le board n’est pas `outside_window` pour cause d’heure

## ADDED Requirements

### Requirement: Départ encore dû (heure réelle)

Un départ MUST rester suivi tant que son heure **réelle** (à défaut théorique) n’est pas échue, avec une tolérance courte (quelques minutes). L’heure théorique passée MUST NOT à elle seule retirer le train du board ni des alertes.

L’appel Navitia `/departures` MUST utiliser un `from_datetime` en lookback pour ne pas rater les trains dont la base est passée mais le temps réel est encore futur.

#### Scenario: Base passée, réel futur

- **GIVEN** un départ base 09:20, réel 09:50, fenêtre 07:00–09:30
- **WHEN** il est 09:35
- **THEN** le train reste le prochain départ / éligible alerte
