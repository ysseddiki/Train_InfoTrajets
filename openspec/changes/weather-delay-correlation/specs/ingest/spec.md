# Delta for Ingest

## ADDED Requirements

### Requirement: Snapshot météo à la détection

Lors de la création ou mise à jour d’un `DisruptionEvent` éligible, l’ingest SHALL récupérer la météo Open-Meteo à la gare surveillée (lat/lon du catalogue) et persister `weather_bucket`, `weather_code`, `weather_label`, `precipitation_mm`, `wind_speed_kmh`, `temperature_c`. MUST NOT appeler d’API météo depuis le client. MUST NOT inventer de motif météo comme cause officielle Navitia.

Si les coordonnées sont inconnues, les champs météo MUST rester `null`.

#### Scenario: Retard avec pluie

- **GIVEN** un retard détecté à Nice-Ville avec coordonnées connues et pluie mesurée
- **WHEN** l’événement est upserté
- **THEN** `weather_bucket = rain` et `precipitation_mm > 0`
