# Proposal: Déploiement conteneurisé (v1.17.0)

Remplace le déploiement bare-metal (systemd + nginx hôte + Postgres optionnel) par une
stack **Docker Compose** reproductible : `db`, `api`, `ingest`, `web` (nginx + build
statique). Certbot en profil optionnel pour Let's Encrypt.

Les unités systemd restent dans le dépôt comme alternative documentée, mais ne sont plus
le chemin recommandé.

## Why

- **Reproductibilité** : même image en staging et prod, pas de `npm install` sur l'hôte
- **Isolation** : l'API n'est pas publiée hors du réseau Docker ; seul `web` expose 80/443
- **Simplicité ops** : `docker compose up -d --build` remplace trois services systemd +
  configuration nginx manuelle
- **Alignement dev** : Postgres était déjà en conteneur (`docker-compose.yml`)

## What Changes

- **ADDED** : `deploy/docker/Dockerfile.{api,web}`, `docker-compose.prod.yml`,
  `deploy/nginx/docker.conf.template`, scripts `deploy-docker.sh` et
  `init-letsencrypt-docker.sh`
- **MODIFIED** : README / AGENTS.md — Docker Compose comme déploiement principal
- **UNCHANGED** : `docker-compose.yml` (Postgres dev local), specs sécurité du change 1

## Impact

- **MODIFIED** : `openspec/specs/system`, `specs/system/baseline-v1.md`
- **BREAKING** (migration) : les serveurs déjà en systemd doivent basculer via
  `./scripts/deploy-docker.sh` (données Postgres migrables via dump/restore du volume)
