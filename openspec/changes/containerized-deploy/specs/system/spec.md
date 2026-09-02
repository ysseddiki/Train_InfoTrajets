# System — delta containerized-deploy

## MODIFIED Requirements

### Requirement: Documentation déploiement adminsys

Le dépôt SHALL documenter le déploiement de production via **Docker Compose**
(`docker-compose.prod.yml`) comme méthode recommandée : services `db`, `api`, `ingest`,
`web` (nginx + build statique). Un script `scripts/deploy-docker.sh` SHALL automatiser
build et démarrage.

Les unités systemd (`deploy/systemd/`) MAY rester documentées comme alternative bare-metal.

L'API et l'ingest MUST NOT publier de ports sur l'hôte en mode conteneurisé ; seul le
service `web` expose les ports HTTP/HTTPS.

#### Scenario: Stack compose opérationnelle

- **GIVEN** un serveur avec Docker et le fichier `.env` configuré
- **WHEN** on exécute `./scripts/deploy-docker.sh`
- **THEN** les conteneurs `db`, `api`, `ingest` et `web` sont `healthy` / `running`
- **AND** l'UI est joignable via HTTPS sur le port 443 du conteneur `web`
- **AND** l'API n'est pas joignable directement depuis l'extérieur du réseau Docker

#### Scenario: TLS Let's Encrypt en Docker

- **GIVEN** le DNS pointe vers le serveur et la stack est démarrée
- **WHEN** on exécute `./scripts/init-letsencrypt-docker.sh <domaine> <email>`
- **THEN** un certificat est obtenu via HTTP-01
- **AND** nginx recharge les certificats sans reconstruire l'image `web`
