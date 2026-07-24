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

Un admin authentifié SHALL pouvoir effacer les données de statistiques dashboard (événements / livraisons) en sélectionnant indépendamment les sources : événements `stub`, `navitia`, `prim`, et/ou livraisons email/Teams.

#### Scenario: Clear événements stub seulement

- **GIVEN** un admin authentifié
- **WHEN** il envoie `POST /v1/admin/stats/clear` avec `eventSources: ["stub"]`
- **THEN** seuls les événements `source=stub` (et livraisons liées) sont supprimés
- **AND** les événements Navitia / PRIM restent

### Requirement: Destinataires email saisis par l’admin

Un admin SHALL pouvoir ajouter et retirer des adresses email destinataires dans l’interface ; ces adresses sont les seules cibles email v1.

#### Scenario: Ajout d’un destinataire

- **GIVEN** un admin authentifié
- **WHEN** il ajoute `ops@example.com` à la liste des destinataires
- **THEN** les prochaines alertes email incluent cette adresse

### Requirement: Configuration ingest en admin

Un admin authentifié SHALL pouvoir lire et mettre à jour la source d’ingest via `GET/PUT /v1/admin/ingest` :

- `provider` : `stub` | `navitia` | `prim`
- secret associé (token Navitia ou clé PRIM) : **write-only**

La réponse publique MUST inclure `tokenConfigured` et, si un secret est présent, `tokenPreview` = les **5 premiers caractères** uniquement. MUST NOT renvoyer le secret complet.

#### Scenario: Lecture masquée

- **GIVEN** un token Navitia stocké commençant par `abc12…`
- **WHEN** l’admin appelle `GET /v1/admin/ingest`
- **THEN** `tokenConfigured` est true et `tokenPreview` vaut `abc12`
- **AND** le corps ne contient pas le reste du token

#### Scenario: Mise à jour sans resaisie

- **GIVEN** un token déjà configuré
- **WHEN** l’admin envoie `PUT` avec un nouveau `provider` et sans `token` (ou token vide)
- **THEN** le secret existant est conservé
