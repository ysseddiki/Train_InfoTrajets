#!/usr/bin/env bash
# Obtient / branche un certificat Let's Encrypt pour SNCF-Alerts (Debian).
#
# nginx termine le TLS et sert le **build statique** du client (apps/web/dist).
# Il n'y a plus de service Node pour l'UI : le mode « Vite direct sur :443 » a été
# retiré (un serveur de développement n'a pas sa place en production).
#
# Usage :
#   sudo ./scripts/setup-letsencrypt.sh exemple.domaine.fr email@exemple.fr
set -euo pipefail

DOMAIN="${1:-}"
EMAIL="${2:-}"

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: sudo $0 <domaine> <email>" >&2
  exit 1
fi

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Exécuter en root (sudo)." >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="${REPO_ROOT}/.env"
NGINX_SRC="${REPO_ROOT}/deploy/nginx/sncf-alerts.conf"
WEB_ROOT="${REPO_ROOT}/apps/web/dist"
WEBROOT="/var/www/certbot"

upsert_env() {
  local key="$1" value="$2"
  touch "$ENV_FILE"
  chmod 600 "$ENV_FILE"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${value}|" "$ENV_FILE"
  else
    echo "${key}=${value}" >> "$ENV_FILE"
  fi
}

drop_env() {
  local key="$1"
  [[ -f "$ENV_FILE" ]] || return 0
  sed -i "/^${key}=/d" "$ENV_FILE"
}

echo "→ Install certbot + nginx (si besoin)"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx ssl-cert

mkdir -p "$WEBROOT"

# Migration depuis l'ancien déploiement (serveur Vite sous systemd)
if systemctl list-unit-files | grep -q '^sncf-alerts-web\.service'; then
  echo "→ Retrait de l'ancien service web (Vite)"
  systemctl disable --now sncf-alerts-web 2>/dev/null || true
  rm -f /etc/systemd/system/sncf-alerts-web.service
  systemctl daemon-reload
fi

echo "→ Build statique du client"
if [[ ! -d "$WEB_ROOT" ]]; then
  su -s /bin/bash -c "cd '$REPO_ROOT' && npm run build -w @sncf-alerts/web" debian
fi
if [[ ! -f "${WEB_ROOT}/index.html" ]]; then
  echo "Build introuvable : ${WEB_ROOT}/index.html" >&2
  echo "Lancer 'npm run build -w @sncf-alerts/web' puis relancer ce script." >&2
  exit 1
fi

echo "→ Configuration nginx"
CONF_DST="/etc/nginx/sites-available/sncf-alerts"
sed -e "s/SERVER_NAME/${DOMAIN}/g" -e "s|WEB_ROOT|${WEB_ROOT}|g" "$NGINX_SRC" > "$CONF_DST"
ln -sfn "$CONF_DST" /etc/nginx/sites-enabled/sncf-alerts
rm -f /etc/nginx/sites-enabled/default

# nginx doit pouvoir traverser l'arborescence jusqu'au build
chmod o+x /home/debian /home/debian/Train_InfoTrajets 2>/dev/null || true

upsert_env COOKIE_SECURE true
# L'UI n'est plus servie par Vite : ces variables ne concernent que le dev local
drop_env WEB_BEHIND_PROXY
drop_env WEB_HOST
drop_env WEB_PORT
drop_env WEB_TLS_CERT
drop_env WEB_TLS_KEY

nginx -t
systemctl enable --now nginx
systemctl reload nginx

echo "→ Demande certificat Let's Encrypt"
certbot --nginx -d "$DOMAIN" --email "$EMAIL" --agree-tos --non-interactive --redirect

mkdir -p /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/sncf-alerts-nginx.sh <<'HOOK'
#!/bin/bash
systemctl reload nginx 2>/dev/null || true
HOOK
chmod +x /etc/letsencrypt/renewal-hooks/deploy/sncf-alerts-nginx.sh

echo "OK — https://${DOMAIN}/ (nginx + Let's Encrypt, build statique)"
echo "Services attendus : sncf-alerts-api, sncf-alerts-ingest, nginx"
echo "Renouvellement : sudo certbot renew --dry-run"
