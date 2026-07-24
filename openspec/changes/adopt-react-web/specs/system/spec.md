# Delta for System

## ADDED Requirements

### Requirement: Stack client web React

Le client `apps/web` MUST être une application **Vite + React + TypeScript**. Il MUST n’appeler que l’API HTTP `/v1` et MUST NOT embarquer de logique d’ingest ni de secrets (SMTP, webhooks, clés PRIM/Navitia).

#### Scenario: Bundle web

- **GIVEN** le package `apps/web`
- **WHEN** un contributeur inspecte la stack
- **THEN** l’UI est construite avec React sous Vite
- **AND** les appels réseau passent par le client `/v1` partagé

#### Scenario: Évolution UI

- **GIVEN** une évolution du dashboard ou de l’admin
- **WHEN** on ajoute un composant ou une route
- **THEN** elle s’inscrit dans l’arborescence React (`pages` / `components`) sans templates HTML string globaux
