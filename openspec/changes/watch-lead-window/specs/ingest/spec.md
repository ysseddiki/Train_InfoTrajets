# Delta for Ingest

## ADDED Requirements

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
