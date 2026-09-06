#!/usr/bin/env bash
# Déploie ou met à jour la stack Docker de production.
set -euo pipefail

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml"

if [[ ! -f .env ]]; then
  echo "Fichier .env manquant." >&2
  echo "Générer avec : ./scripts/init-env.sh <domaine> <email>" >&2
  echo "Ou bootstrap : ./scripts/bootstrap-prod.sh <domaine> <email> --deploy --tls" >&2
  exit 1
fi

# Compose lit POSTGRES_* pour construire DATABASE_URL — hex recommandé (pas base64).
if grep -qE '^POSTGRES_PASSWORD=.*[+/\$]' .env 2>/dev/null; then
  echo "Attention: POSTGRES_PASSWORD contient des caractères qui cassent DATABASE_URL." >&2
  echo "Régénérer avec : ./scripts/init-env.sh <domaine> <email> --force" >&2
  exit 1
fi

echo "→ Build des images"
$COMPOSE build

echo "→ Démarrage des services"
$COMPOSE up -d

echo "→ État"
$COMPOSE ps

DOMAIN="$(grep -E '^SERVER_NAME=' .env 2>/dev/null | cut -d= -f2- || echo localhost)"
EMAIL="$(grep -E '^LETSENCRYPT_EMAIL=' .env 2>/dev/null | cut -d= -f2- || true)"

echo ""
echo "OK. UI : https://${DOMAIN}/"
echo "Health : $COMPOSE exec api node -e \"fetch('http://127.0.0.1:3001/v1/health').then(r=>r.json()).then(console.log)\""
echo "Identifiants admin : cat .admin-credentials"
echo ""
if [[ -n "${EMAIL:-}" ]]; then
  echo "TLS Let's Encrypt (si pas encore fait) :"
  echo "  ./scripts/init-letsencrypt-docker.sh ${DOMAIN} ${EMAIL}"
else
  echo "TLS Let's Encrypt (si pas encore fait) :"
  echo "  ./scripts/init-letsencrypt-docker.sh ${DOMAIN} <email>"
fi
