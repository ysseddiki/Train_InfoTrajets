## MODIFIED Requirements

### Requirement: Failover GTFS-RT ZOU (open data)

Quand `zouFailoverEnabled` est vrai, le poll Navitia SHALL basculer vers les flux open data ZOU PACA (GTFS-RT **TripUpdates** + GTFS static) si le token Navitia est absent, le quota journalier est épuisé, ou un appel Navitia échoue. Les événements / snapshots SHALL utiliser `source = zou`. ZOU MUST NOT être un `IngestProviderId` primaire.

L’éligibilité d’un trip MUST être déterminée uniquement par la **paire UIC** : arrêt d’origine puis arrêt de destination **après** l’origine, via les `stop_time_update` RT et, si incomplets, via `stop_times` GTFS static. MUST NOT dépendre des terminus helpers, de l’allowlist corridor, ni du headsign pour décider l’éligibilité.

Les **retards / suppressions** (`kind = delay` | `cancellation`) MUST provenir uniquement des TripUpdates (`StopTimeEvent.delay`, `CANCELED`, `SKIPPED` au stop d’origine). Les Service Alerts MUST NOT créer d’événements.

À chaque poll en fenêtre de veille, le système SHALL évaluer **tous** les trips éligibles dont l’heure de départ à l’origine tombe dans la fenêtre de veille du trajet. Le snapshot board SHALL exposer uniquement le **prochain** départ ; les alertes MAY être créées pour tout trip au-dessus du seuil `min_delay_minutes`.

#### Scenario: Quota épuisé + failover ON

- **GIVEN** provider `navitia`, quota épuisé, `zouFailoverEnabled = true`, trajet en fenêtre de veille
- **WHEN** le poll tourne
- **THEN** le système interroge le GTFS-RT TripUpdates ZOU
- **AND** MAY écrire des événements ou un board `source = zou`

#### Scenario: Matching UIC sans terminus helpers

- **GIVEN** liaison Nice → Monaco avec UIC origine et destination
- **WHEN** un TripUpdate a l’origine puis Monaco plus loin sur le parcours (RT ou static)
- **THEN** le trip est éligible même si le headsign est « Menton »
- **AND** les terminus helpers de la gare catalogue sont ignorés

#### Scenario: Tous les trains de la fenêtre

- **GIVEN** trois trips éligibles dont le départ origine est dans la fenêtre de veille, dont un avec retard ≥ seuil
- **WHEN** le poll ZOU tourne
- **THEN** le board affiche le prochain départ
- **AND** un événement `delay` MAY être créé pour le trip en retard (pas seulement le prochain)
