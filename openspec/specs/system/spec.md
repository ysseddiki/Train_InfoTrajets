# System Specification

## Purpose

SNCF-Alerts est un outil **ops interne** qui surveille une ou plusieurs **liaisons** SNCF (chaque liaison = Aller + Retour), affiche un dashboard de lecture (session ou visiteur), permet de configurer cibles et canaux selon le rôle, et envoie des alertes via **Email (SMTP custom)** et **Microsoft Teams**.

Le client (`apps/web`) et le serveur (`apps/api`) sont strictement séparés. Les secrets et intégrations externes restent côté serveur. Comptes **locaux** (rôles `reader` / `liaison_editor` / `admin`) ; pas de comptes voyageurs B2C ni de canal push.

## Requirements

### Requirement: Produit ops interne Aller/Retour

Le système SHALL être un outil ops interne qui surveille une ou plusieurs liaisons (chaque liaison = `outbound` / Aller et `inbound` / Retour), expose un dashboard de lecture (session ou visiteur) et une console admin selon le rôle, et notifie via Email (SMTP) et Teams. Les comptes sont **locaux** (un rôle parmi `reader`, `liaison_editor`, `admin`), créés par un admin. Pas de comptes voyageurs B2C ni de canal push.

#### Scenario: Périmètre

- **GIVEN** le déploiement
- **WHEN** un opérateur utilise le produit
- **THEN** les surfaces Dashboard, Notifications et Admin (filtrée) sont disponibles
- **AND** aucun compte voyageur ni canal push n’existe
- **AND** au moins une liaison est configurée (seed par défaut)
- **AND** aucune source d’ingest scrape Gares & Connexions n’est disponible

Hors scope v1 explicite : scrape / failover G&C (Datadome) ; `displayUrl` catalogue = lien UI seulement.

### Requirement: Séparation client/serveur

Le client web MUST n’appeler que l’API HTTP `/v1` ; les intégrations Navitia / ZOU, SMTP et Teams MUST s’exécuter uniquement côté serveur.

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

### Requirement: Stack client web React

Le client `apps/web` MUST être une application **Vite + React + TypeScript**. Il MUST n’appeler que l’API HTTP `/v1` et MUST NOT embarquer de logique d’ingest ni de secrets (SMTP, webhooks, clés Navitia).

#### Scenario: Bundle web

- **GIVEN** le package `apps/web`
- **WHEN** un contributeur inspecte la stack
- **THEN** l’UI est construite avec React sous Vite
- **AND** les appels réseau passent par le client `/v1` partagé

#### Scenario: Évolution UI

- **GIVEN** une évolution du dashboard ou de l’admin
- **WHEN** on ajoute un composant ou une route
- **THEN** elle s’inscrit dans l’arborescence React (`pages` / `components`) sans templates HTML string globaux

### Requirement: Documentation déploiement adminsys

Le dépôt SHALL fournir des unités systemd d’exemple (`deploy/systemd/` : api, ingest, web) et une section README expliquant API vs ingest vs UI.

#### Scenario: Install units

- **GIVEN** un serveur Linux avec le repo déployé
- **WHEN** l’adminsys copie `deploy/systemd/*.service` et active les services
- **THEN** l’API et l’ingest peuvent tourner en process séparés
