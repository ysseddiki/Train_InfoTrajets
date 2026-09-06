#!/usr/bin/env bash
# Génère un .env de production Docker complet.
#
# Entrées obligatoires (seules valeurs à fournir) :
#   1. domaine public (SERVER_NAME)
#   2. email Let's Encrypt
#
# Tout le reste (mots de passe, secrets) est généré aléatoirement en hex
# (URL-safe : pas de / + = $ qui cassent DATABASE_URL dans Compose).
#
# Usage :
#   ./scripts/init-env.sh trains.yseddiki.fr contact@yseddiki.fr
#   ./scripts/init-env.sh trains.yseddiki.fr contact@yseddiki.fr --force
#   ./scripts/init-env.sh trains.yseddiki.fr contact@yseddiki.fr --admin-user ops
#
# Affiche les identifiants admin une fois, et les enregistre dans
# .admin-credentials (chmod 600, gitignoré).
set -euo pipefail

cd "$(dirname "$0")/.."

DOMAIN="${1:-}"
EMAIL="${2:-}"
ADMIN_USER="admin"
FORCE=0

shift $(( $# >= 2 ? 2 : $# )) || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --force) FORCE=1 ;;
    --admin-user)
      ADMIN_USER="${2:-}"
      if [[ -z "$ADMIN_USER" ]]; then
        echo "Usage: --admin-user <nom>" >&2
        exit 1
      fi
      shift
      ;;
    -h|--help)
      sed -n '2,20p' "$0" | sed 's/^# \?//'
      exit 0
      ;;
    *)
      echo "Option inconnue: $1" >&2
      exit 1
      ;;
  esac
  shift
done

if [[ -z "$DOMAIN" || -z "$EMAIL" ]]; then
  echo "Usage: $0 <domaine> <email-letsencrypt> [--force] [--admin-user NAME]" >&2
  echo "Exemple: $0 trains.yseddiki.fr contact@yseddiki.fr" >&2
  exit 1
fi

if [[ ! "$EMAIL" =~ ^[^@]+@[^@]+\.[^@]+$ ]]; then
  echo "Email invalide: $EMAIL" >&2
  exit 1
fi

if [[ -f .env && "$FORCE" -ne 1 ]]; then
  echo ".env existe déjà. Relancer avec --force pour le régénérer (nouveaux mots de passe)." >&2
  echo "Ou éditer .env à la main. Pour déployer: ./scripts/deploy-docker.sh" >&2
  exit 1
fi

rand_hex() {
  local bytes="${1:-24}"
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$bytes"
  else
    head -c "$bytes" /dev/urandom | xxd -p -c "$bytes"
  fi
}

ADMIN_PASSWORD="$(rand_hex 16)"
POSTGRES_PASSWORD="$(rand_hex 24)"
SESSION_SECRET="$(rand_hex 32)"
SECRETS_ENCRYPTION_KEY="$(rand_hex 32)"
POSTGRES_USER="sncf"
POSTGRES_DB="sncf_alerts"

if [[ -f .env ]]; then
  cp .env ".env.bak.$(date +%Y%m%d%H%M%S)"
fi

umask 077
cat > .env <<EOF
# Généré par scripts/init-env.sh — $(date -u +%Y-%m-%dT%H:%M:%SZ)
# Ne pas committer. Identifiants admin aussi dans .admin-credentials

# --- Entrées ops ---
SERVER_NAME=${DOMAIN}
LETSENCRYPT_EMAIL=${EMAIL}
HTTP_PORT=80
HTTPS_PORT=443

POSTGRES_USER=${POSTGRES_USER}
POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
POSTGRES_DB=${POSTGRES_DB}

# --- Auth UI ---
ADMIN_USERNAME=${ADMIN_USER}
ADMIN_PASSWORD=${ADMIN_PASSWORD}
ADMIN_PASSWORD_SYNC=false

SESSION_SECRET=${SESSION_SECRET}
SESSION_TTL_HOURS=12
COOKIE_SECURE=true

SECRETS_ENCRYPTION_KEY=${SECRETS_ENCRYPTION_KEY}

# --- Surchargés par docker-compose.prod.yml (laisser tels quels) ---
API_HOST=127.0.0.1
API_PORT=3001
TRUSTED_PROXIES=
CORS_ORIGINS=
DATABASE_URL=postgres://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:5432/${POSTGRES_DB}

# --- Ingest ---
INGEST_PROVIDER=stub
INGEST_IN_PROCESS=false
INGEST_INTERVAL_MS=300000
DEPARTURES_CACHE_TTL_MS=90000
NAVITIA_DAILY_QUOTA=5000

# --- Rate limits ---
LOGIN_RATE_MAX=10
LOGIN_RATE_MAX_USER=20
LOGIN_RATE_WINDOW_MS=900000
READ_RATE_MAX=300
READ_RATE_WINDOW_MS=60000
WEATHER_BUDGET_MAX=120
WEATHER_BUDGET_WINDOW_MS=60000

# --- Notifs (configurer plus tard via Admin) ---
EMAIL_ENABLED=false
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USERNAME=
SMTP_PASSWORD=
SMTP_FROM=
TEAMS_ENABLED=false
TEAMS_WEBHOOK_URL=
EOF
chmod 600 .env

cat > .admin-credentials <<EOF
SNCF-Alerts — identifiants initiaux
Généré: $(date -u +%Y-%m-%dT%H:%M:%SZ)

URL:      https://${DOMAIN}/
Login:    ${ADMIN_USER}
Password: ${ADMIN_PASSWORD}

Postgres: user=${POSTGRES_USER}  db=${POSTGRES_DB}
(Le mot de passe Postgres est dans .env — POSTGRES_PASSWORD)

Let's Encrypt: ${EMAIL}

Prochaines étapes:
  sudo ./scripts/deploy-docker.sh
  sudo ./scripts/init-letsencrypt-docker.sh ${DOMAIN} ${EMAIL}
EOF
chmod 600 .admin-credentials

echo ""
echo "════════════════════════════════════════════════════════"
echo "  .env généré (chmod 600)"
echo "════════════════════════════════════════════════════════"
echo "  Domaine :  ${DOMAIN}"
echo "  Email LE : ${EMAIL}"
echo ""
echo "  UI admin"
echo "  --------"
echo "  URL      : https://${DOMAIN}/"
echo "  Login    : ${ADMIN_USER}"
echo "  Password : ${ADMIN_PASSWORD}"
echo ""
echo "  Copie aussi dans : .admin-credentials"
echo "════════════════════════════════════════════════════════"
echo ""
echo "Suite :"
echo "  sudo ./scripts/deploy-docker.sh"
echo "  sudo ./scripts/init-letsencrypt-docker.sh ${DOMAIN} ${EMAIL}"
echo ""
echo "Ou en une commande :"
echo "  sudo ./scripts/bootstrap-prod.sh ${DOMAIN} ${EMAIL} --deploy --tls"
echo ""
