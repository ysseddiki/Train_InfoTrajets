#!/usr/bin/env bash
# Déploie ou met à jour la stack Docker de production.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml"

if [[ ! -f .env ]]; then
  echo "Fichier .env manquant. Copier .env.example puis éditer ADMIN_PASSWORD, POSTGRES_PASSWORD, SERVER_NAME." >&2
  exit 1
fi

echo "→ Build des images"
$COMPOSE build

echo "→ Démarrage des services"
$COMPOSE up -d

echo "→ État"
$COMPOSE ps

echo ""
echo "OK. UI : https://$(grep -E '^SERVER_NAME=' .env 2>/dev/null | cut -d= -f2- || echo localhost)/"
echo "Health (interne) : docker compose -f docker-compose.prod.yml exec api curl -fsS http://127.0.0.1:3001/v1/health"
echo ""
echo "TLS Let's Encrypt (si pas encore fait) :"
echo "  ./scripts/init-letsencrypt-docker.sh <domaine> <email>"
