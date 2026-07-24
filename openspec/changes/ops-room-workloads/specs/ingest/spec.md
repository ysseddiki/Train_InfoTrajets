# Delta for Ingest

## ADDED Requirements

### Requirement: Filtre gare desservie

Le filtre de sens MUST matcher une **gare desservie** (libellé / id présents dans la direction affichée des départs), pas uniquement le terminus commercial.

#### Scenario: Direction Menton via Monaco

- **GIVEN** filtre destination « Monaco »
- **WHEN** un départ affiche une direction contenant « Monaco »
- **THEN** le départ est éligible même si le terminus textuel est plus loin

### Requirement: Workloads séparés

Le poll ingest SHALL pouvoir tourner hors du process API (`INGEST_IN_PROCESS=false` + worker dédié). Des unités systemd SHALL être fournies en exemple.

### Requirement: Cache départs

Les appels départs Navitia SHALL être mis en cache process (TTL configurable, défaut ~90 s) pour limiter le quota.

### Requirement: File de notification

Les envois Email/Teams SHALL être enfilés (`notify_jobs`) et traités de façon asynchrone par rapport au poll.

### Requirement: Secrets ingest hors env

Après bootstrap initial éventuel, le token Navitia MUST être géré via Admin (DB). Le fichier `.env.example` MUST NOT documenter `NAVITIA_TOKEN` comme configuration courante.
