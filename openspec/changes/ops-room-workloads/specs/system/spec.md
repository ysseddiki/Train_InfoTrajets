# Delta for System

## ADDED Requirements

### Requirement: Documentation déploiement adminsys

Le dépôt SHALL fournir des unités systemd d’exemple et une section README expliquant API vs ingest, sans imposer Prometheus.

#### Scenario: Install units

- **GIVEN** un serveur Linux avec le repo déployé
- **WHEN** l’adminsys copie `deploy/systemd/*.service` et active les services
- **THEN** l’API et l’ingest peuvent tourner en process séparés
