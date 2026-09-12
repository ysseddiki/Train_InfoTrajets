#!/usr/bin/env bash
# Obtient un certificat Let's Encrypt pour la stack Docker (HTTP-01 via nginx).
#
# Prérequis : DNS A/AAAA → ce serveur, ports 80/443 ouverts, stack déjà démarrée,
# conteneur `web` Up (pas Restarting).
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

# SERVER_NAME doit correspondre au domaine demandé (dossier live/<domaine>)
if grep -q '^SERVER_NAME=' .env 2>/dev/null; then
  sed -i.bak "s|^SERVER_NAME=.*|SERVER_NAME=${DOMAIN}|" .env
  rm -f .env.bak
else
  echo "SERVER_NAME=${DOMAIN}" >> .env
fi
if grep -q '^LETSENCRYPT_EMAIL=' .env 2>/dev/null; then
  sed -i.bak "s|^LETSENCRYPT_EMAIL=.*|LETSENCRYPT_EMAIL=${EMAIL}|" .env
  rm -f .env.bak
else
  echo "LETSENCRYPT_EMAIL=${EMAIL}" >> .env
fi

echo "→ Redémarrage web avec SERVER_NAME=${DOMAIN}"
$COMPOSE up -d web

# web Restarting → ACME Connection refused ; échouer tôt
sleep 3
if ! $COMPOSE ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx web; then
  echo "Le conteneur web n'est pas Up — Let's Encrypt échouera (Connection refused)." >&2
  $COMPOSE ps >&2 || true
  $COMPOSE logs web --tail 30 >&2 || true
  exit 1
fi

# Smoke test HTTP local (challenge ACME)
if ! curl -fsS -o /dev/null --max-time 5 "http://127.0.0.1/" 2>/dev/null; then
  echo "http://127.0.0.1/ ne répond pas — ouvrir le port 80 / vérifier web." >&2
  $COMPOSE logs web --tail 40 >&2 || true
  exit 1
fi

echo "→ Demande certificat (certbot webroot)"
$COMPOSE --profile certbot run --rm certbot certonly \
  --webroot -w /var/www/certbot \
  -d "$DOMAIN" \
  --email "$EMAIL" \
  --agree-tos \
  --non-interactive \
  --keep-until-expiring

echo "→ Recreate web (re-lit les certificats LE — un reload ne suffit pas)"
$COMPOSE up -d --force-recreate web

sleep 2
if ! $COMPOSE ps --status running --format '{{.Service}}' 2>/dev/null | grep -qx web; then
  echo "web n'a pas redémarré correctement après LE." >&2
  $COMPOSE logs web --tail 40 >&2 || true
  exit 1
fi

echo "→ Vérification du certificat servi"
issuer="$(echo | openssl s_client -connect 127.0.0.1:443 -servername "$DOMAIN" 2>/dev/null \
  | openssl x509 -noout -issuer 2>/dev/null || true)"
echo "  ${issuer:-inconnu}"
if echo "$issuer" | grep -qi "Let's Encrypt\|R3\|R10\|R11\|E1\|E5\|ISRG"; then
  echo "OK — certificat Let's Encrypt actif sur https://${DOMAIN}/"
else
  echo "Attention: l'émetteur ne ressemble pas à Let's Encrypt." >&2
  echo "Vérifier: $COMPOSE exec web ls -la /etc/letsencrypt/live/${DOMAIN}/" >&2
  echo "Logs web: $COMPOSE logs web --tail 20" >&2
  exit 1
fi

echo ""
echo "Si le navigateur affiche encore ERR_CERT_AUTHORITY_INVALID (HSTS) :"
echo "  Chrome/Edge → chrome://net-internals/#hsts → Delete domain security policies → ${DOMAIN}"
echo ""
echo "Renouvellement (cron quotidien) :"
echo "  cd $(pwd) && $COMPOSE --profile certbot run --rm certbot renew \\"
echo "    && $COMPOSE up -d --force-recreate web"
