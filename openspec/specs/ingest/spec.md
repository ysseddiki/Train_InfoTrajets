# Ingest Specification

## Purpose

Ingestion des perturbations SNCF via un adapter (stub / Navitia) et matching sur les trajets Aller et Retour.

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

Le lag de 2 h après `time_window.end` MUST permettre de suivre un train dont l’heure théorique est dans la fenêtre trajet mais dont l’heure réelle n’est pas encore échue (retard croissant).

Pendant toute la veille (lead, fenêtre trajet, lag), un départ MUST être éligible board/alerte seulement si son heure **théorique** (`base` / scheduled) est dans `time_window` (sauf `watch_always`). Le lead démarre le poll plus tôt ; il MUST NOT élargir le set de trains aux départs hors plage trajet.

#### Scenario: Lead 4 h

- **GIVEN** Aller actif, fenêtre trajet 07:00–09:30, `watch_always = false`, `watch_lead_hours = 4`
- **WHEN** il est mardi 04:30 Europe/Paris
- **THEN** l’ingest poll ce sens (veille commencée)

#### Scenario: Lead sans trains hors plage

- **GIVEN** Retour actif, fenêtre trajet 16:00–20:00, `watch_lead_hours = 2`
- **WHEN** il est 15:00 Europe/Paris
- **THEN** l’ingest poll ce sens
- **AND** un train théorique 15:20 retardé n’est pas éligible
- **AND** un train théorique 16:30 est éligible

`watch_lead_hours` MUST être ignoré pour le calcul de veille lorsque `watch_always` est vrai (valeur conservée pour réactivation).

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

Le filtre de sens MUST matcher une **gare desservie** (libellé / id présents dans la direction affichée des départs), pas uniquement le terminus commercial. L’allowlist corridor (ex. Menton au-delà de Monaco) MAY compléter le matching **Navitia** lorsque le headsign n’expose que le terminus.

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
- **WHEN** le `vehicle_journey` Navitia liste `stop_area` Monaco **après** l’origine surveillée
- **THEN** le départ est éligible

#### Scenario: Vehicle journey — gare filtre en amont rejetée

- **GIVEN** Retour Monaco → Nice et un train Nice → Menton (Nice avant Monaco sur le parcours)
- **WHEN** le matching enrichit via `vehicle_journey`
- **THEN** le départ n’est **pas** éligible (Nice n’est pas après Monaco)

### Requirement: Pas de failover scrape Gares & Connexions

Le pipeline d’ingest MUST NOT scraper Gares & Connexions ni exposer une source `garesetconnexions`. MUST NOT interroger les flux GTFS-RT / GTFS ZOU. En cas d’échec Navitia (token manquant, erreur API / quota renvoyé par Navitia), le poll MUST enregistrer un statut `error` ou `skipped` et MUST NOT basculer vers une autre source board. Le compteur local `NAVITIA_DAILY_QUOTA` MUST rester une **jauge d’affichage** : il MUST NOT interrompre le poll tant que l’API Navitia répond.

#### Scenario: Navitia KO

- **GIVEN** provider actif `navitia`, token invalide ou API en erreur
- **WHEN** le poll tourne
- **THEN** `last_ingest_status` est `error` (ou `skipped` si hors fenêtre)

#### Scenario: Jauge locale dépassée sans erreur API

- **GIVEN** le compteur local ≥ `NAVITIA_DAILY_QUOTA` mais Navitia répond encore 200
- **WHEN** le poll tourne
- **THEN** l’ingest continue et n’est pas marqué `skipped` pour cause de jauge locale

#### Scenario: Quota refusé par Navitia

- **GIVEN** Navitia répond HTTP 429 (ou message quota)
- **WHEN** le poll appelle les départs
- **THEN** `last_ingest_status` est `error` avec un détail indiquant le quota API
- **AND** aucun appel HTTP vers `garesetconnexions.sncf` ni vers les flux ZOU n’est effectué

### Requirement: Board prochain train sans stub

Les snapshots `journey_board_snapshots` affichés sur le dashboard MUST provenir de `navitia`. Le provider stub MUST NOT écrire ni exposer de prochain train sur le board. Les snapshots historiques `source=garesetconnexions` et `source=zou` MUST être ignorés (comme le stub).

#### Scenario: Stub désactivé

- **GIVEN** des snapshots `source=stub` en base et provider actif ≠ stub
- **WHEN** le dashboard charge l’overview
- **THEN** `nextDeparture` est absent pour ces journeys (stub ignoré / purgé)

#### Scenario: Ancien snapshot G&C

- **GIVEN** un snapshot `source=garesetconnexions` en base
- **WHEN** le dashboard charge l’overview
- **THEN** `nextDeparture` est absent pour ce journey

#### Scenario: Snapshot ZOU ignoré

- **GIVEN** un snapshot `source=zou` en base
- **WHEN** le dashboard charge l’overview
- **THEN** ce snapshot n’est pas exposé comme `nextDeparture`

### Requirement: Observations trains à l’heure

Pour chaque départ Navitia matché (filtre destination + fenêtre trajet / veille), l’ingest MUST enregistrer une observation idempotente (`on_time` | `delayed` | `cancelled` | `unknown`) même si le train est à l’heure. Ces observations MUST NOT déclencher de notification. Elles MUST alimenter les compteurs journaliers utilisés par la heatmap.

#### Scenario: Train à l’heure observé

- **GIVEN** un départ surveillé avec `delay_minutes = 0`
- **WHEN** le poll Navitia traite ce départ
- **THEN** une observation `on_time` est persistée
- **AND** aucun événement d’alerte n’est créé pour ce départ
- **AND** le compteur `on_time_count` du jour (liaison) est incrémenté à la première observation

### Requirement: Horaires Navitia en Europe/Paris

Les datetimes Navitia (`YYYYMMDDThhmmss`) MUST être interprétés comme mur **Europe/Paris**, indépendamment du fuseau du process API. L’affichage board (théorique / temps réel) MUST correspondre à l’horaire affiché Gares & Connexions pour le même train.

#### Scenario: Process UTC

- **GIVEN** un départ Navitia `base_departure_date_time = 20260825T164700`
- **WHEN** le process API tourne en `TZ=UTC`
- **THEN** le board affiche théorique `16:47` (pas `18:47`)

### Requirement: Suppressions Navitia

Un départ MUST être traité comme `cancelled` si Navitia signale `departure_status` deleted/skipped, `additional_informations` de suppression, ou une disruption liée d’effet `NO_SERVICE` / `DELETED_DEPARTURE`. Les suppressions MUST alimenter observations, alertes (si sévérité activée) et le board lorsque ce train est le prochain chronologique.

#### Scenario: Disruption NO_SERVICE

- **GIVEN** un départ surveillé lié à une disruption `severity.effect = NO_SERVICE`
- **WHEN** le poll traite ce départ
- **THEN** une observation / événement `cancelled` est créé
- **AND** si c’est le prochain train chronologique, le board affiche « Supprimé »

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

L’ingest SHALL persister `delay_reason` (texte affichable) et `delay_reason_key` (clé de regroupement stats) quand Navitia en fournit, sinon `null`. MUST NOT inventer un motif.

Navitia : messages / cause des `disruptions` liées au départ.

#### Scenario: Navitia avec disruption

- **GIVEN** un départ Navitia lié à une disruption « travaux »
- **WHEN** un retard éligible est ingéré
- **THEN** `delay_reason_key` reflète la cause / catégorie
- **AND** `delay_reason` MAY contenir le message

### Requirement: Snapshot météo à la détection

Lors de la création ou mise à jour d’un `DisruptionEvent` éligible, l’ingest SHALL récupérer la météo Open-Meteo à la gare surveillée (lat/lon du catalogue) et persister `weather_bucket`, `weather_code`, `weather_label`, `precipitation_mm`, `wind_speed_kmh`, `temperature_c`. MUST NOT appeler d’API météo depuis le client. MUST NOT inventer de motif météo comme cause officielle Navitia.

Si les coordonnées sont inconnues, les champs météo MUST rester `null`.

#### Scenario: Retard avec pluie

- **GIVEN** un retard détecté à Nice-Ville avec coordonnées connues et pluie mesurée
- **WHEN** l’événement est upserté
- **THEN** `weather_bucket = rain` et `precipitation_mm > 0`
