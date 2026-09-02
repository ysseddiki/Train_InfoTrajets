#!/usr/bin/env bash
# Obtient un certificat Let's Encrypt pour la stack Docker (HTTP-01 via nginx).
#
# Prérequis : DNS A/AAAA → ce serveur, ports 80/443 ouverts, stack déjà démarrée.
#
# Usage :
#   ./scripts/init-letsencrypt-docker.sh ops.exemple.fr admin@exemple.fr
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: $0 <domaine> <email>" >&2
  exit 1
fi

cd "$(dirname "$0")/.."
COMPOSE="docker compose -f docker-compose.prod.yml"

# SERVER_NAME doit correspondre au domaine demandé
if grep -q '^SERVER_NAME=' .env 2>/dev/null; then
  sed -i.bak "s|^SERVER_NAME=.*|SERVER_NAME=${DOMAIN}|" .env
  rm -f .env.bak
else
  echo "SERVER_NAME=${DOMAIN}" >> .env
fi

echo "→ Redémarrage web avec SERVER_NAME=${DOMAIN}"
$COMPOSE up -d web

echo "→ Demande certificat (certbot webroot)"
$COMPOSE --profile certbot run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive

echo "→ Reload nginx (prise en compte des certificats LE)"
$COMPOSE exec web nginx -s reload

echo "OK — https://${DOMAIN}/"
echo ""
echo "Renouvellement (cron recommandé, quotidien) :"
echo "  cd $(pwd) && $COMPOSE --profile certbot run --rm certbot renew && $COMPOSE exec web nginx -s reload"
