# Proposal: Refacto failover ZOU (UIC + TripUpdates)

## Why

Le failover ZOU mélangeait Service Alerts (effect abusivement `SIGNIFICANT_DELAYS`), helpers terminus et matching texte. Résultat : faux « Retard unknown ». Le contrat clair est : **retard = TripUpdates uniquement**, **éligibilité = UIC origine → UIC destination**.

## What Changes

- **MODIFIED** : matching ZOU = paire UIC sur parcours RT ou GTFS static (`stop_times`) — plus de terminus helpers / corridor / headsign sur le chemin critique
- **MODIFIED** : événements retard / suppression uniquement depuis TripUpdates ; Service Alerts ne créent plus d’événements
- **MODIFIED** : à chaque poll, **tous** les trips éligibles dont le départ tombe dans la fenêtre de veille sont évalués ; le board garde le prochain
- **KEPT** : `zouFailoverEnabled`, source `zou`, pas de provider ZOU primaire

## Impact

- `departures-zou-gtfsrt.ts`, `ingest.ts` (`pollJourneyZou`)
- Specs ingest / admin (helpers ZOU)
- UI Gares : helpers marqués non utilisés par le failover
