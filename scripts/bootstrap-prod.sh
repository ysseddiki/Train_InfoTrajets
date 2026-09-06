#!/usr/bin/env bash
# Bootstrap production Docker : .env → build/up → (optionnel) Let's Encrypt.
#
# Entrées obligatoires :
#   <domaine>  <email-letsencrypt>
#
# Usage :
#   ./scripts/bootstrap-prod.sh trains.yseddiki.fr contact@yseddiki.fr
#   sudo ./scripts/bootstrap-prod.sh trains.yseddiki.fr contact@yseddiki.fr --deploy --tls
#   sudo ./scripts/bootstrap-prod.sh trains.yseddiki.fr contact@yseddiki.fr --force --deploy --tls
set -euo pipefail

cd "$(dirname "$0")/.."

DOMAIN="${1:-}"
EMAIL="${2:-}"
DO_DEPLOY=0
DO_TLS=0
FORCE_ARGS=()
ADMIN_ARGS=()

shift $(( $# >= 2 ? 2 : $# )) || true
while [[ $# -gt 0 ]]; do
  case "$1" in
    --deploy) DO_DEPLOY=1 ;;
    --tls) DO_TLS=1; DO_DEPLOY=1 ;;
    --force) FORCE_ARGS+=(--force) ;;
    --admin-user)
      ADMIN_ARGS+=(--admin-user "${2:-}")
      shift
      ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \?//'
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
  echo "Usage: $0 <domaine> <email> [--force] [--deploy] [--tls] [--admin-user NAME]" >&2
  exit 1
fi

./scripts/init-env.sh "$DOMAIN" "$EMAIL" "${FORCE_ARGS[@]+"${FORCE_ARGS[@]}"}" "${ADMIN_ARGS[@]+"${ADMIN_ARGS[@]}"}"

if [[ "$DO_DEPLOY" -ne 1 ]]; then
  exit 0
fi

echo "→ Déploiement Docker"
./scripts/deploy-docker.sh

if [[ "$DO_TLS" -ne 1 ]]; then
  exit 0
fi

echo "→ Attente que web soit Up (max 90s)"
COMPOSE="docker compose -f docker-compose.prod.yml"
for i in $(seq 1 30); do
  status="$($COMPOSE ps --status running --format '{{.Service}}' 2>/dev/null | grep -x web || true)"
  if [[ "$status" == "web" ]]; then
    # Port 80 doit répondre (même en cert auto-signé / redirect)
    if curl -fsS -o /dev/null --max-time 3 "http://127.0.0.1/" 2>/dev/null \
      || curl -kfsS -o /dev/null --max-time 3 "https://127.0.0.1/" 2>/dev/null; then
      break
    fi
  fi
  if [[ "$i" -eq 30 ]]; then
    echo "web n'est pas joignable sur :80/:443 — corriger avant Let's Encrypt." >&2
    $COMPOSE ps >&2 || true
    $COMPOSE logs web --tail 40 >&2 || true
    exit 1
  fi
  sleep 3
done

echo "→ Let's Encrypt"
./scripts/init-letsencrypt-docker.sh "$DOMAIN" "$EMAIL"

echo ""
echo "Bootstrap terminé. Identifiants : cat .admin-credentials"
