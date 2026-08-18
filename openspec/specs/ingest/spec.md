# Ingest Specification

## Purpose

Ingestion des perturbations SNCF via un adapter (stub / Navitia) et matching sur les trajets Aller et Retour. Failover optionnel ZOU GTFS-RT.

## Requirements

### Requirement: Ingest via adapter unique

Le pipeline d’ingest SHALL utiliser un port `DisruptionIngestPort` avec une implémentation active à la fois (`stub` ou `navitia`), choisie via la **config admin** (`activeProvider`).

#### Scenario: Mode stub

- **GIVEN** provider admin = `stub`
- **WHEN** le worker tourne
- **THEN** aucun appel externe n’est requis ; des événements synthétiques peuvent être injectés via debug admin

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
- sinon : de `time_window.start − watch_lead_hours` jusqu’à `time_window.end + 2 h` (TZ `Europe/Paris`), avec `watch_lead_hours` ∈ [0, 12] (défaut 4)

Le lag de 2 h après `time_window.end` MUST permettre de suivre un train dont l’heure théorique est dans la fenêtre trajet mais dont l’heure réelle n’est pas encore échue (retard croissant). Après `time_window.end`, un départ dont l’heure théorique est **hors** fenêtre trajet MUST NOT être éligible.

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

### Requirement: Départ encore dû (heure réelle)

Un départ MUST rester suivi tant que son heure **réelle** (à défaut théorique) n’est pas échue, avec une tolérance courte (quelques minutes). L’heure théorique passée MUST NOT à elle seule retirer le train du board ni des alertes.

L’appel Navitia `/departures` MUST utiliser un `from_datetime` en lookback pour ne pas rater les trains dont la base est passée mais le temps réel est encore futur.

#### Scenario: Base passée, réel futur

- **GIVEN** un départ base 09:20, réel 09:50, fenêtre 07:00–09:30
- **WHEN** il est 09:35
- **THEN** le train reste le prochain départ / éligible alerte

### Requirement: Filtre gare desservie

Le filtre de sens MUST matcher une **gare desservie** (libellé / id présents dans la direction affichée des départs), pas uniquement le terminus commercial. L’allowlist corridor (ex. Menton au-delà de Monaco) MAY compléter le matching **Navitia** lorsque le headsign n’expose que le terminus. Le failover ZOU MUST matcher par **paire UIC** (voir requirement Failover), sans terminus helpers.

#### Scenario: Direction Menton via Monaco

- **GIVEN** filtre destination « Monaco »
- **WHEN** un départ affiche une direction contenant « Monaco »
- **THEN** le départ est éligible même si le terminus textuel est plus loin

#### Scenario: Terminus Menton (corridor)

- **GIVEN** filtre Nice → Monaco
- **WHEN** le board Navitia n’affiche que « Menton »
- **THEN** le départ est éligible via allowlist corridor

#### Scenario: Enrichissement Navitia vehicle_journey

- **GIVEN** filtre Monaco et un départ dont le texte de direction ne mentionne pas Monaco
- **WHEN** le `vehicle_journey` Navitia liste `stop_area` Monaco
- **THEN** le départ est éligible

### Requirement: Pas de failover scrape Gares & Connexions

Le pipeline d’ingest MUST NOT scraper Gares & Connexions ni exposer une source `garesetconnexions`. Un failover open data **ZOU GTFS-RT** MAY être activé via `zouFailoverEnabled` (voir requirement dédié). Sans ce toggle, en cas d’échec Navitia (token manquant, quota, erreur API), le poll MUST enregistrer un statut `error` ou `skipped` et MUST NOT basculer vers un board HTML tiers.

#### Scenario: Navitia KO sans failover ZOU

- **GIVEN** provider actif `navitia`, token invalide ou API en erreur, `zouFailoverEnabled = false`
- **WHEN** le poll tourne
- **THEN** `last_ingest_status` est `error` (ou `skipped` si hors fenêtre / quota)
- **AND** aucun appel HTTP vers `garesetconnexions.sncf` n’est effectué

### Requirement: Failover GTFS-RT ZOU (open data)

Quand `zouFailoverEnabled` est vrai, le poll Navitia SHALL basculer vers les flux open data ZOU PACA (GTFS-RT **TripUpdates** + GTFS static) si le token Navitia est absent, le quota journalier est épuisé, ou un appel Navitia échoue. Les événements / snapshots SHALL utiliser `source = zou`. ZOU MUST NOT être un `IngestProviderId` primaire sélectionnable. Plusieurs URLs TripUpdates MAY être fusionnées (`ZOU_GTFSRT_TRIPS_URLS`).

L’éligibilité d’un trip MUST être la **paire UIC** origine → destination (après l’origine) via `stop_time_update` RT, sinon `stop_times` static. MUST NOT utiliser terminus helpers, corridor, ni headsign pour l’éligibilité.

Les retards / suppressions MUST provenir uniquement des TripUpdates. Les Service Alerts MUST NOT créer d’événements (logs debug seulement).

À chaque poll, le système SHALL évaluer **tous** les trips éligibles dans la fenêtre de veille ; le board SHALL exposer le **prochain** départ seulement.

#### Scenario: Quota épuisé + failover ON

- **GIVEN** provider `navitia`, quota épuisé, `zouFailoverEnabled = true`, trajet en fenêtre de veille
- **WHEN** le poll tourne
- **THEN** le système interroge le GTFS-RT TripUpdates ZOU
- **AND** MAY écrire des événements ou un board `source = zou`

#### Scenario: Matching UIC sans terminus helpers

- **GIVEN** liaison Nice → Monaco avec UIC origine et destination
- **WHEN** un TripUpdate a Nice puis Monaco plus loin (RT ou static), headsign « Menton »
- **THEN** le trip est éligible
- **AND** les terminus helpers catalogue sont ignorés

#### Scenario: Tous les trains de la fenêtre

- **GIVEN** plusieurs trips OD dont le départ tombe dans la fenêtre de veille, un avec retard ≥ seuil
- **WHEN** le poll ZOU tourne
- **THEN** le board affiche le prochain
- **AND** un événement `delay` MAY être créé pour le trip en retard

#### Scenario: Service Alert ignorée

- **GIVEN** une Service Alert ZOU (ex. canicule)
- **WHEN** le failover poll
- **THEN** aucun événement n’est créé depuis cette alerte

### Requirement: Board prochain train sans stub

Les snapshots `journey_board_snapshots` affichés sur le dashboard MUST provenir de `navitia` ou `zou` (failover). Le provider stub MUST NOT écrire ni exposer de prochain train sur le board. Les snapshots historiques `source=garesetconnexions` MUST être ignorés (comme le stub).

#### Scenario: Stub désactivé

- **GIVEN** des snapshots `source=stub` en base et provider actif ≠ stub
- **WHEN** le dashboard charge l’overview
- **THEN** `nextDeparture` est absent pour ces journeys (stub ignoré / purgé)

#### Scenario: Ancien snapshot G&C

- **GIVEN** un snapshot `source=garesetconnexions` en base
- **WHEN** le dashboard charge l’overview
- **THEN** `nextDeparture` est absent pour ce journey

#### Scenario: Snapshot ZOU failover

- **GIVEN** un snapshot `source=zou` en base
- **WHEN** le dashboard charge l’overview
- **THEN** `nextDeparture` est exposé pour ce journey

Le poll ingest SHALL pouvoir tourner hors du process API (`INGEST_IN_PROCESS=false` + worker dédié). Des unités systemd SHALL être fournies en exemple (`deploy/systemd/`).

### Requirement: Cache départs

Les appels départs Navitia SHALL être mis en cache process (TTL configurable, défaut ~90 s) via `DeparturesPort`.

### Requirement: File de notification

Les envois Email/Teams SHALL être enfilés (`notify_jobs`) et traités de façon asynchrone par rapport au poll.

### Requirement: Secrets ingest hors env

Après bootstrap provider éventuel (`INGEST_PROVIDER`), le token Navitia MUST être géré via Admin (DB). Le fichier `.env.example` MUST NOT documenter `NAVITIA_TOKEN` comme configuration courante.

### Requirement: Feature flags ops

Le système SHALL exposer des interrupteurs ops (`stub` | `navitia` via Admin Ingest, `INGEST_IN_PROCESS`) via `GET /v1/health.flags`.

### Requirement: Palier de re-notification

Après le premier événement éligible, les polls suivants MUST mettre à jour `delay_minutes` / sévérité / motif sur le même `external_event_id`. Une **nouvelle** notification SHALL être enfilée seulement si :

- le retard connu a augmenté d’au moins `notify_step_minutes` **depuis la dernière notif** (`notified_delay_minutes`), ou
- la sévérité a augmenté, ou
- le `kind` passe à `cancellation`

`notify_step_minutes` ∈ [0, 60], défaut 5. Si `0`, MUST NOT re-notifier pour une hausse de durée (sévérité / suppression restent éligibles). Une baisse de retard MUST NOT déclencher de notif. Le board MUST continuer à se mettre à jour à chaque poll.

#### Scenario: Palier +5

- **GIVEN** un événement déjà notifié à 12 min, `notify_step_minutes = 5`
- **WHEN** un poll voit 18 min
- **THEN** l’événement est mis à jour à 18
- **AND** une nouvelle notif est enfilée

#### Scenario: Sous le palier

- **GIVEN** notifié à 12 min, palier 5
- **WHEN** un poll voit 14 min
- **THEN** `delay_minutes` est 14
- **AND** aucune notif n’est enfilée

### Requirement: Motif de retard optionnel

L’ingest SHALL persister `delay_reason` (texte affichable) et `delay_reason_key` (clé de regroupement stats) quand la source en fournit, sinon `null`. MUST NOT inventer un motif. MUST NOT créer d’événement à partir d’une Service Alert ZOU seule.

Navitia : messages / cause des `disruptions` liées au départ. ZOU : texte d’une Service Alert uniquement si `informed_entity.trip_id` correspond au TripUpdate.

#### Scenario: Navitia avec disruption

- **GIVEN** un départ Navitia lié à une disruption « travaux »
- **WHEN** un retard éligible est ingéré
- **THEN** `delay_reason_key` reflète la cause / catégorie
- **AND** `delay_reason` MAY contenir le message

#### Scenario: ZOU sans alerte trip

- **GIVEN** un TripUpdate retard sans Service Alert pour ce `trip_id`
- **WHEN** l’événement ZOU est créé
- **THEN** `delay_reason` est `null`
