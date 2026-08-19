# Delta for Admin

## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Section Comptes et Accès (admin)

La console SHALL exposer, pour un `admin` uniquement, une section **Comptes** (création, rôle, désactivation) et une section **Accès** (toggle mode visiteur).

#### Scenario: Toggle visiteur

- **GIVEN** un admin sur Accès
- **WHEN** il désactive le mode visiteur
- **THEN** `PUT /v1/admin/settings/access` persiste `visitorEnabled: false`
