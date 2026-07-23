# System Specification

## Purpose

SNCF-Alerts est un outil **ops interne** qui surveille deux trajets SNCF (**Aller** / **Retour**), affiche un dashboard de lecture, permet à un **admin** de configurer cibles et canaux, et envoie des alertes via **Email (SMTP custom)** et **Microsoft Teams**.

Le client (`apps/web`) et le serveur (`apps/api`) sont strictement séparés. Les secrets et intégrations externes restent côté serveur. Aucun compte voyageur en v1 (éventuellement version lointaine).

## Requirements

### Requirement: Produit ops interne Aller/Retour

Le système SHALL être un outil ops interne qui surveille exactement deux trajets configurés (`outbound` / Aller et `inbound` / Retour), expose un dashboard de lecture et une console admin, et notifie via Email (SMTP) et Teams.

#### Scenario: Périmètre v1

- **GIVEN** le déploiement v1
- **WHEN** un opérateur utilise le produit
- **THEN** seules les surfaces Dashboard et Admin sont disponibles
- **AND** aucun compte voyageur ni canal push n’existe

### Requirement: Séparation client/serveur

Le client web MUST n’appeler que l’API HTTP `/v1` ; les intégrations PRIM/Navitia, SMTP et Teams MUST s’exécuter uniquement côté serveur.

#### Scenario: Pas de secret dans le front

- **GIVEN** le bundle `apps/web`
- **WHEN** on inspecte le code client
- **THEN** aucune clé API, mot de passe SMTP ou webhook Teams n’y figure

### Requirement: Privacy et secrets

Le système MUST NOT stocker de mots de passe en clair, MUST NOT committer de secrets dans git, et MUST masquer les credentials dans les réponses API (`configured` / `****`).

#### Scenario: Lecture config SMTP

- **GIVEN** un SMTP configuré avec mot de passe
- **WHEN** l’admin appelle `GET /v1/admin/channels/smtp`
- **THEN** la réponse n’inclut pas le mot de passe en clair
- **AND** indique que le secret est configuré
