# Admin Specification

## Purpose

La console d’administration permet à un admin authentifié de configurer les **liaisons** (Aller/Retour), le SMTP, les destinataires email, le canal Teams, et de lancer des tests d’envoi.

## Requirements

### Requirement: Console admin authentifiée

La console admin MUST exiger un login simple (session serveur) avant tout accès aux opérations de configuration.

#### Scenario: Accès non authentifié

- **GIVEN** aucune session admin
- **WHEN** un client appelle `GET /v1/admin/liaisons`
- **THEN** l’API retourne `401`

### Requirement: Configuration des liaisons

Un admin authentifié SHALL pouvoir lister, créer, mettre à jour et supprimer des liaisons (chaque liaison = `outbound` + `inbound`). Le nom MAY être vide : l’affichage MUST alors utiliser `origine <-> destination`. Au moins une liaison MUST rester.

#### Scenario: Mise à jour d’une liaison

- **GIVEN** un admin authentifié
- **WHEN** il envoie `PUT /v1/admin/liaisons/:id` avec une config valide
- **THEN** les deux sens sont persistés et la liaison est renvoyée (sans secrets)

#### Scenario: Nom auto

- **GIVEN** une liaison avec `name` vide et gares Nice / Monaco
- **WHEN** l’UI ou l’API calcule `displayName`
- **THEN** la valeur est basée sur les libellés des gares au format `départ <-> arrivée`

### Requirement: Console liaison unifiée

La console admin SHALL présenter chaque liaison comme un formulaire unifié : une paire de gares (miroir automatique), fenêtres distinctes par sens, jours Semaine / Week-end, réseau TER implicite.

#### Scenario: Enregistrement

- **GIVEN** un admin authentifié
- **WHEN** il enregistre une liaison
- **THEN** le client appelle `PUT /v1/admin/liaisons/:id` avec `network` TER

### Requirement: Config veille par sens

La console admin SHALL permettre, pour Aller et Retour, de configurer la veille :

- checkbox **Veille continue** (`watch_always`)
- liste **Commencer la veille N h avant** la fenêtre trajet (`watch_lead_hours`, 0 à 12)

Si **Veille continue** est cochée, la liste MUST être désactivée (grisée) ; la valeur sélectionnée MAY être conservée.

#### Scenario: Lead grisé

- **GIVEN** un admin édite l’Aller avec Veille continue cochée
- **WHEN** le formulaire s’affiche
- **THEN** le select 0–12 h est disabled

### Requirement: Clear stats par source

Un admin authentifié SHALL pouvoir effacer les données de statistiques dashboard (événements / livraisons) en sélectionnant indépendamment les sources : événements `stub`, `navitia`, `zou`, `prim` (legacy), et/ou livraisons email/Teams.

#### Scenario: Clear événements stub seulement

- **GIVEN** un admin authentifié
- **WHEN** il envoie `POST /v1/admin/stats/clear` avec `eventSources: ["stub"]`
- **THEN** seuls les événements `source=stub` (et livraisons liées) sont supprimés
- **AND** les événements Navitia / ZOU restent

### Requirement: Catalogue de gares

Un admin authentifié SHALL pouvoir créer, modifier et supprimer des gares (`label`, `externalId` Navitia, `displayUrl` optionnel, helpers terminus optionnels). La configuration d’une liaison SHALL afficher la **liste complète** des gares du catalogue avec un **champ de recherche** pour filtrer, et MUST proposer un accès « Créer » vers le catalogue si la gare n’existe pas.

`displayUrl` SHALL servir uniquement de lien UI (fiche publique) ; le système MUST NOT l’utiliser pour un scrape.

Chaque gare MAY exposer des **terminus / destinations d’aide** (`terminusHelperLabels`) activables via `terminusHelpersEnabled`. Quand la gare est le filtre destination d’une liaison et que l’option est active, le matching SHALL accepter un headsign / direction board contenant l’un de ces libellés (en plus du matching label / corridor).

#### Scenario: Création depuis la liaison

- **GIVEN** un admin édite une liaison
- **WHEN** il clique Créer à côté du sélecteur de gare
- **THEN** il accède à la section Gares pour ajouter une entrée au catalogue

#### Scenario: Lien fiche sans scrape

- **GIVEN** une gare avec `displayUrl` renseignée
- **WHEN** l’admin enregistre la gare
- **THEN** l’URL est persistée pour l’UI
- **AND** aucun job d’ingest ne lit cette URL comme source de départs

#### Scenario: Terminus d’aide activés

- **GIVEN** la gare Monaco avec `terminusHelpersEnabled = true` et labels `Menton`, `Vintimille`
- **WHEN** un départ affiche la direction « Menton »
- **THEN** le matching accepte le départ pour une liaison filtrée sur Monaco

### Requirement: Destinataires email saisis par l’admin

Un admin SHALL pouvoir ajouter et retirer des adresses email destinataires dans l’interface ; ces adresses sont les seules cibles email v1.

#### Scenario: Ajout d’un destinataire

- **GIVEN** un admin authentifié
- **WHEN** il ajoute `ops@example.com` à la liste des destinataires
- **THEN** les prochaines alertes email incluent cette adresse

### Requirement: Configuration ingest en admin

Un admin authentifié SHALL pouvoir configurer **indépendamment** les providers `stub` et `navitia`, puis choisir le provider **actif** via `GET/PUT /v1/admin/ingest`.

- Secret Navitia : **write-only** ; `tokenPreview` = 5 premiers caractères
- `POST /v1/admin/ingest/probe` : test API sans forcément activer
- À l’enregistrement d’un token (ou à l’activation), le serveur MUST appeler l’API cible et MUST persister le résultat du check (`lastCheckOk` / détail). MUST NOT bloquer la sauvegarde si le check échoue
- MAY exposer un toggle `zouFailoverEnabled` (failover GTFS-RT ZOU open data)
- MUST NOT exposer de provider `prim` (Île-de-France)

#### Scenario: Deux slots indépendants

- **GIVEN** un token Navitia déjà saisi
- **WHEN** l’admin active `stub`
- **THEN** le secret Navitia reste configuré

#### Scenario: Toggle failover ZOU

- **GIVEN** un admin connecté
- **WHEN** il active le failover ZOU via `PUT /v1/admin/ingest` `{ zouFailoverEnabled: true }`
- **THEN** `GET /v1/admin/ingest` renvoie `zouFailoverEnabled: true`

#### Scenario: Token Navitia invalide

- **GIVEN** un admin authentifié
- **WHEN** il envoie `PUT /v1/admin/ingest` avec un `navitiaToken` rejeté par `api.sncf.com`
- **THEN** le secret est quand même persisté
- **AND** le check stocké indique un échec (`lastCheckOk = false`)
- **AND** l’API ne renvoie pas `400` pour cause de probe

### Requirement: Configuration SMTP en admin

Un admin authentifié SHALL pouvoir lire et mettre à jour la config SMTP via `GET/PUT /v1/admin/channels/smtp` (host, port, secure, username, from, enabled). Le mot de passe MUST être write-only (`passwordConfigured` en lecture). La config MUST être stockée côté serveur (app_meta) ; un bootstrap depuis `.env` MAY remplir les meta vides une seule fois.