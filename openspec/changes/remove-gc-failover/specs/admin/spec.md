# Delta for Admin

## MODIFIED Requirements

### Requirement: Catalogue de gares

Un admin authentifié SHALL pouvoir créer, modifier et supprimer des gares (`label`, `externalId` Navitia, `displayUrl` optionnel). `displayUrl` SHALL servir uniquement de lien UI (fiche publique) ; le système MUST NOT l’utiliser pour un scrape. Aucun champ d’alias terminus scrape (`terminusAliases`) MUST être exposé.

#### Scenario: Création depuis la liaison

- **GIVEN** un admin édite une liaison
- **WHEN** il clique Créer à côté du sélecteur de gare
- **THEN** il accède à la section Gares pour ajouter une entrée au catalogue

#### Scenario: Lien fiche sans scrape

- **GIVEN** une gare avec `displayUrl` renseignée
- **WHEN** l’admin enregistre la gare
- **THEN** l’URL est persistée pour l’UI
- **AND** aucun job d’ingest ne lit cette URL comme source de départs

### Requirement: Clear stats par source

Un admin authentifié SHALL pouvoir effacer les données de statistiques dashboard (événements / livraisons) en sélectionnant indépendamment les sources : événements `stub`, `navitia`, `prim`, et/ou livraisons email/Teams. MUST NOT proposer une source `garesetconnexions`.

#### Scenario: Clear événements stub seulement

- **GIVEN** un admin authentifié
- **WHEN** il envoie `POST /v1/admin/stats/clear` avec `eventSources: ["stub"]`
- **THEN** seuls les événements `source=stub` (et livraisons liées) sont supprimés
- **AND** les événements Navitia / PRIM restent

### Requirement: Configuration ingest en admin

Un admin authentifié SHALL pouvoir configurer **indépendamment** les providers `stub`, `navitia` et `prim`, puis choisir le provider **actif** via `GET/PUT /v1/admin/ingest`.

- Secrets Navitia / PRIM : **write-only** ; `tokenPreview` = 5 premiers caractères
- `POST /v1/admin/ingest/probe` : test API sans forcément activer
- À l’enregistrement d’un token (ou à l’activation d’un provider distant), le serveur MUST appeler l’API cible et MUST persister le résultat du check (`lastCheckOk` / détail). MUST NOT bloquer la sauvegarde ni l’activation si le check échoue
- MUST NOT exposer de toggle `gcFailoverEnabled` ni d’option scrape G&C

#### Scenario: Trois slots indépendants

- **GIVEN** un token Navitia et une clé PRIM déjà saisis
- **WHEN** l’admin active `stub`
- **THEN** les secrets Navitia et PRIM restent configurés (slots indépendants)
