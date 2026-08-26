# Admin Specification

## Purpose

La console d’administration permet à un admin authentifié de configurer les **liaisons** (Aller/Retour), le SMTP, les destinataires email, le canal Teams, et de lancer des tests d’envoi.

## Requirements

### Requirement: Console admin authentifiée et filtrée par rôle

La console admin MUST exiger une session. L’accès aux opérations MUST dépendre du rôle :

- `reader` : aucun accès admin (`403` / pas de lien UI)
- `liaison_editor` : CRUD liaisons ; lecture catalogue gares ; création d’une gare (`POST /v1/admin/stations`) depuis le formulaire liaison ; changement de son mot de passe
- `admin` : toutes les opérations (canaux, ingest, debug, clear stats, gares CRUD, comptes, toggle visiteur)

#### Scenario: Accès non authentifié

- **GIVEN** aucune session
- **WHEN** un client appelle `GET /v1/admin/liaisons`
- **THEN** l’API retourne `401`

#### Scenario: Reader refusé

- **GIVEN** une session `reader`
- **WHEN** il appelle `GET /v1/admin/liaisons`
- **THEN** l’API retourne `403`

#### Scenario: Éditeur liaisons sans secrets

- **GIVEN** une session `liaison_editor`
- **WHEN** il appelle `GET /v1/admin/channels/smtp`
- **THEN** l’API retourne `403`

#### Scenario: Éditeur crée une liaison

- **GIVEN** une session `liaison_editor`
- **WHEN** il envoie `POST /v1/admin/liaisons`
- **THEN** la liaison est créée

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

### Requirement: Palier de notif par liaison

La console SHALL exposer `notify_step_minutes` (minutes, 0–60, défaut 5) au même niveau que le seuil de retard. Les deux sens d’une liaison SHALL recevoir la même valeur à l’enregistrement (comme `min_delay_minutes`).

#### Scenario: Palier 10

- **GIVEN** un admin authentifié
- **WHEN** il enregistre une liaison avec palier 10
- **THEN** Aller et Retour ont `notify_step_minutes = 10`

### Requirement: Clear stats par source

Un admin authentifié SHALL pouvoir effacer les données de statistiques dashboard (événements / livraisons) en sélectionnant indépendamment les sources : événements `stub`, `navitia`, `zou` (legacy), `prim` (legacy), et/ou livraisons email/Teams.

Quand au moins une source d’événements est sélectionnée, le clear MUST aussi purger `board_day_observations` et `board_train_observations` afin que la **heatmap** et les **indicateurs** liés aux jours observés se vident comme les agrégats retards (rebuild au prochain poll).

#### Scenario: Clear événements stub seulement

- **GIVEN** un admin authentifié
- **WHEN** il envoie `POST /v1/admin/stats/clear` avec `eventSources: ["stub"]`
- **THEN** seuls les événements `source=stub` (et livraisons liées) sont supprimés
- **AND** les événements Navitia restent
- **AND** les observations heatmap board sont aussi purgées

#### Scenario: Clear livraisons seules

- **GIVEN** un admin authentifié
- **WHEN** il envoie `POST /v1/admin/stats/clear` avec `deliveries: true` sans `eventSources`
- **THEN** seules les livraisons sont supprimées
- **AND** la heatmap / observations board ne sont pas touchées

### Requirement: Catalogue de gares

Un admin authentifié SHALL pouvoir créer, modifier et supprimer des gares (`label`, `externalId` Navitia, `displayUrl` optionnel, helpers terminus optionnels). La configuration d’une liaison SHALL afficher la **liste complète** des gares du catalogue avec un **champ de recherche** pour filtrer, et MUST proposer un accès « Créer » vers le catalogue si la gare n’existe pas.

`displayUrl` SHALL servir uniquement de lien UI (fiche publique) ; le système MUST NOT l’utiliser pour un scrape.

Chaque gare MAY encore exposer des champs **terminus / destinations d’aide** (`terminusHelperLabels`, `terminusHelpersEnabled`) en catalogue. Navitia MUST NOT les utiliser pour l’éligibilité.

#### Scenario: Création depuis la liaison

- **GIVEN** un admin édite une liaison
- **WHEN** il clique Créer à côté du sélecteur de gare
- **THEN** il accède à la section Gares pour ajouter une entrée au catalogue

#### Scenario: Lien fiche sans scrape

- **GIVEN** une gare avec `displayUrl` renseignée
- **WHEN** l’admin enregistre la gare
- **THEN** l’URL est persistée pour l’UI
- **AND** aucun job d’ingest ne lit cette URL comme source de départs

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
- MUST NOT exposer de toggle failover ZOU ni de provider `prim` (Île-de-France)

#### Scenario: Deux slots indépendants

- **GIVEN** un token Navitia déjà saisi
- **WHEN** l’admin active `stub`
- **THEN** le secret Navitia reste configuré

#### Scenario: Pas de toggle ZOU

- **GIVEN** un admin sur Ingest
- **WHEN** `GET /v1/admin/ingest` est appelé
- **THEN** la réponse n’inclut pas `zouFailoverEnabled`

#### Scenario: Token Navitia invalide

- **GIVEN** un admin authentifié
- **WHEN** il envoie `PUT /v1/admin/ingest` avec un `navitiaToken` rejeté par `api.sncf.com`
- **THEN** le secret est quand même persisté
- **AND** le check stocké indique un échec (`lastCheckOk = false`)
- **AND** l’API ne renvoie pas `400` pour cause de probe

### Requirement: Configuration SMTP en admin

Un admin authentifié SHALL pouvoir lire et mettre à jour la config SMTP via `GET/PUT /v1/admin/channels/smtp` (host, port, secure, username, from, enabled). Le mot de passe MUST être write-only (`passwordConfigured` en lecture). La config MUST être stockée côté serveur (app_meta) ; un bootstrap depuis `.env` MAY remplir les meta vides une seule fois.

### Requirement: Formulaire mot de passe

La console SHALL exposer une section Compte (et un menu shell) permettant de changer le mot de passe (actuel, nouveau, confirmation). MUST NOT préremplir ni afficher le mot de passe existant.

#### Scenario: Confirmation

- **GIVEN** un utilisateur change son mot de passe
- **WHEN** nouveau et confirmation diffèrent
- **THEN** le client n’envoie pas la requête

### Requirement: Section Comptes et Accès (admin)

La console SHALL exposer, pour un `admin` uniquement, une section **Comptes** (création, rôle, désactivation) et une section **Accès** (toggle mode visiteur).

#### Scenario: Toggle visiteur

- **GIVEN** un admin sur Accès
- **WHEN** il désactive le mode visiteur
- **THEN** `PUT /v1/admin/settings/access` persiste `visitorEnabled: false`

### Requirement: Onglet Statuts trains (debug admin)

Le shell MUST exposer un onglet **Trains** (remplace l’ancienne surface « Réponse API ») accessible uniquement aux sessions `admin`. Cet onglet MUST lister les dernières observations `board_train_observations` (numéro, départ théorique gare surveillée, statut à l’heure / retard / suppression, retard en minutes si connu) via `GET /v1/admin/debug/train-observations`. Les rôles `reader` / `liaison_editor` MUST NOT voir le lien ni accéder à l’endpoint (`403`).

#### Scenario: Admin lit les observations

- **GIVEN** une session `admin` et des observations ingest
- **WHEN** il ouvre l’onglet Trains
- **THEN** la liste affiche train, départ théorique, statut et retard

#### Scenario: Non-admin refusé

- **GIVEN** une session `liaison_editor`
- **WHEN** il appelle `GET /v1/admin/debug/train-observations`
- **THEN** l’API retourne `403`

### Requirement: Échantillons requêtes Navitia (Debug)

L’onglet Admin → **Debug** MUST afficher en bas une doc des appels Navitia (`catalog` : situation, template URL, headers) et une liste d’échantillons bruts (`samples` : dump HTTP avec `Authorization: Basic ***`) via `GET /v1/admin/debug/outbound-http`. `DELETE` MUST vider les échantillons live. Accès `admin` uniquement. MUST NOT exposer le token.

#### Scenario: Admin consulte la doc + samples

- **GIVEN** une session `admin` et au moins un poll Navitia après démarrage
- **WHEN** il ouvre Debug et charge `GET /v1/admin/debug/outbound-http`
- **THEN** la réponse inclut le catalogue des 3 kinds (`departures`, `vehicle_journey`, `probe`)
- **AND** chaque sample contient `rawRequest` sans secret réel
