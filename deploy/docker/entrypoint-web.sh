#!/bin/sh
# Choisit les certificats TLS avant le envsubst nginx :
# - Let's Encrypt monté dans /etc/letsencrypt si présent
# - sinon certificat auto-signé éphémère (bootstrap / dev docker)
set -eu

NAME="${SERVER_NAME:-localhost}"
LE_DIR="/etc/letsencrypt/live/${NAME}"

if [ -f "${LE_DIR}/fullchain.pem" ] && [ -f "${LE_DIR}/privkey.pem" ]; then
  export SSL_CERT="${LE_DIR}/fullchain.pem"
  export SSL_KEY="${LE_DIR}/privkey.pem"
else
  mkdir -p /etc/nginx/ssl
  if [ ! -f /etc/nginx/ssl/cert.pem ]; then
    echo "[web] Pas de certificat LE pour ${NAME} — auto-signé (lancer scripts/init-letsencrypt-docker.sh)"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /etc/nginx/ssl/key.pem \
      -out /etc/nginx/ssl/cert.pem \
      -subj "/CN=${NAME}" 2>/dev/null
  fi
  export SSL_CERT=/etc/nginx/ssl/cert.pem
  export SSL_KEY=/etc/nginx/ssl/key.pem
fi
