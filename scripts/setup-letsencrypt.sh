#!/usr/bin/env bash
# Obtient / branche un certificat Let's Encrypt pour SNCF-Alerts (Debian).
# Usage :
#   sudo ./scripts/setup-letsencrypt.sh exemple.domaine.fr email@exemple.fr
#   sudo ./scripts/setup-letsencrypt.sh exemple.domaine.fr email@exemple.fr --vite-direct
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"
MODE="${3:-}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: sudo $0 <domaine> <email> [--vite-direct]" >&2
  echo "  (défaut) nginx termine TLS ; Vite en HTTP local :5173" >&2
  echo "  --vite-direct  Vite lit les PEM Let's Encrypt sur le port 443" >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Exécuter en root (sudo)." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
NGINX_SRC="${REPO_ROOT}/deploy/nginx/sncf-alerts.conf"
WEBROOT="/var/www/certbot"

upsert_env() {
  local key="$1" value="$2"
  touch "$ENV_FILE"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

echo "→ Install certbot + nginx (si besoin)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx ssl-cert

mkdir -p "$WEBROOT"

if [[ "$MODE" == "--vite-direct" ]]; then
  echo "→ Mode Vite direct (port 443 + PEM Let's Encrypt)"
  echo "  Arrêt temporaire du web pour libérer 80/443 si besoin…"
  systemctl stop sncf-alerts-web 2>/dev/null || true
  if systemctl is-active --quiet nginx; then
    certbot certonly --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive || \
      certbot certonly --standalone -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive
  else
    certbot certonly --standalone -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive
  fi

  CERT="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
  KEY="/etc/letsencrypt/live/${DOMAIN}/privkey.pem"
  if [[ ! -f "$CERT" || ! -f "$KEY" ]]; then
    echo "Certificat introuvable sous /etc/letsencrypt/live/${DOMAIN}/" >&2
    exit 1
  fi

  usermod -aG ssl-cert debian 2>/dev/null || true
  chmod 640 "$KEY" 2>/dev/null || true
  chgrp ssl-cert "$KEY" 2>/dev/null || true

  upsert_env WEB_BEHIND_PROXY false
  upsert_env WEB_HOST 0.0.0.0
  upsert_env WEB_PORT 443
  upsert_env WEB_TLS_CERT "$CERT"
  upsert_env WEB_TLS_KEY "$KEY"
  upsert_env COOKIE_SECURE true

  mkdir -p /etc/letsencrypt/renewal-hooks/deploy
  cat > /etc/letsencrypt/renewal-hooks/deploy/sncf-alerts-web.sh <<'HOOK'
#!/bin/bash
set -euo pipefail
if [[ -n "${RENEWED_LINEAGE:-}" ]]; then
  KEY="${RENEWED_LINEAGE}/privkey.pem"
  chgrp ssl-cert "$KEY" 2>/dev/null || true
  chmod 640 "$KEY" 2>/dev/null || true
fi
systemctl restart sncf-alerts-web 2>/dev/null || true
HOOK
  chmod +x /etc/letsencrypt/renewal-hooks/deploy/sncf-alerts-web.sh

  systemctl daemon-reload
  systemctl start sncf-alerts-web
  echo "OK — Vite sert https://${DOMAIN}/ avec Let's Encrypt"
  echo "Vérifier : sudo systemctl status sncf-alerts-web"
  exit 0
fi

echo "→ Mode nginx (recommandé)"
CONF_DST="/etc/nginx/sites-available/sncf-alerts"
sed "s/SERVER_NAME/${DOMAIN}/g" "$NGINX_SRC" > "$CONF_DST"
ln -sfn "$CONF_DST" /etc/nginx/sites-enabled/sncf-alerts
rm -f /etc/nginx/sites-enabled/default

upsert_env WEB_BEHIND_PROXY true
upsert_env WEB_HOST 127.0.0.1
upsert_env WEB_PORT 5173
# Plus de PEM côté Vite
if grep -q "^WEB_TLS_CERT=" "$ENV_FILE" 2>/dev/null; then
  sed -i "/^WEB_TLS_CERT=/d" "$ENV_FILE"
fi
if grep -q "^WEB_TLS_KEY=" "$ENV_FILE" 2>/dev/null; then
  sed -i "/^WEB_TLS_KEY=/d" "$ENV_FILE"
fi
upsert_env COOKIE_SECURE true

systemctl stop sncf-alerts-web 2>/dev/null || true
nginx -t
systemctl enable --now nginx
systemctl daemon-reload
systemctl restart sncf-alerts-web 2>/dev/null || true

echo "→ Demande certificat Let's Encrypt"
certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --redirect

mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/sncf-alerts-nginx.sh <<'HOOK'
#!/bin/bash
systemctl reload nginx 2>/dev/null || true
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/sncf-alerts-nginx.sh

echo "OK — https://${DOMAIN}/ (nginx + Let's Encrypt)"
echo "Vite doit être actif : sudo systemctl status sncf-alerts-web nginx"
echo "Renouvellement : sudo certbot renew --dry-run"
