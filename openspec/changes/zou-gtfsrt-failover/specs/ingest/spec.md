## ADDED Requirements

### Requirement: Failover GTFS-RT ZOU (open data)

Quand `zouFailoverEnabled` est vrai, le poll Navitia SHALL basculer vers les flux open data ZOU PACA (GTFS-RT TripUpdates + Service Alerts) si le token Navitia est absent, le quota journalier est épuisé, ou un appel Navitia échoue. ZOU MUST NOT être un `IngestProviderId` primaire. Le scrape Gares & Connexions MUST rester interdit.

#### Scenario: Quota épuisé + failover ON

- **GIVEN** provider `navitia`, quota épuisé, `zouFailoverEnabled = true`
- **WHEN** le poll tourne dans une fenêtre de veille
- **THEN** le système interroge le GTFS-RT ZOU et MAY écrire des événements / snapshots `source = zou`

#### Scenario: Failover OFF

- **GIVEN** `zouFailoverEnabled = false` et Navitia indisponible
- **WHEN** le poll tourne
- **THEN** `last_ingest_status` est `error` ou `skipped`
- **AND** aucun appel aux URLs ZOU n’est requis

### Requirement: Matching UIC ZOU

Le matching ZOU SHALL dériver l’UIC depuis `originId` / `destinationId` Navitia (`87xxxxxx`) et le comparer aux `stop_id` GTFS-RT / index GTFS static. Le filtre destination SHALL réutiliser `matchesDestinationFilter` (libellé / corridor) via le headsign GTFS quand disponible.

#### Scenario: Départ Nice avec headsign Menton

- **GIVEN** trajet Nice → Monaco et un TripUpdate avec stop UIC Nice et headsign Menton
- **WHEN** le failover ZOU traite le feed
- **THEN** le départ est éligible (corridor)
