#!/bin/sh
# Prépare TLS + conf nginx AVANT 20-envsubst-on-templates.sh.
#
# Les scripts /docker-entrypoint.d/* sont exécutés (sous-processus) : un `export`
# ici ne serait pas visible par les scripts suivants. On écrit donc directement
# /etc/nginx/conf.d/default.conf, puis on retire le .template pour que 20- ne
# régénère pas une conf cassée (SSL_CERT/SSL_KEY vides → nginx exit 1).
#
# HSTS n'est activé qu'avec un certificat Let's Encrypt : l'envoyer sur un
# auto-signé verrouille les navigateurs (ERR_CERT_AUTHORITY_INVALID + HSTS).
set -eu

NAME="${SERVER_NAME:-localhost}"
LE_DIR="/etc/letsencrypt/live/${NAME}"
TEMPLATE="/etc/nginx/templates/default.conf.template"
OUTPUT="/etc/nginx/conf.d/default.conf"

# Permet de forcer LE même si le fichier est un symlink (cas normal certbot)
le_ready() {
  [ -e "${LE_DIR}/fullchain.pem" ] && [ -e "${LE_DIR}/privkey.pem" ]
}

if le_ready; then
  SSL_CERT="${LE_DIR}/fullchain.pem"
  SSL_KEY="${LE_DIR}/privkey.pem"
  HSTS_HEADER='add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;'
  echo "[web] Certificats Let's Encrypt pour ${NAME}"
else
  mkdir -p /etc/nginx/ssl
  if [ ! -f /etc/nginx/ssl/cert.pem ] || [ ! -f /etc/nginx/ssl/key.pem ]; then
    echo "[web] Pas de certificat LE pour ${NAME} — génération auto-signée (sans HSTS)"
    openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
      -keyout /etc/nginx/ssl/key.pem \
      -out /etc/nginx/ssl/cert.pem \
      -subj "/CN=${NAME}"
  else
    echo "[web] Certificat auto-signé existant (sans HSTS)"
  fi
  SSL_CERT=/etc/nginx/ssl/cert.pem
  SSL_KEY=/etc/nginx/ssl/key.pem
  HSTS_HEADER=""
fi

export SERVER_NAME="${NAME}"
export SSL_CERT
export SSL_KEY
export HSTS_HEADER

if [ ! -f "$TEMPLATE" ]; then
  echo "[web] Template manquant: $TEMPLATE" >&2
  exit 1
fi

# Ne substituer que nos variables — laisser intactes $host, $uri, etc.
envsubst '${SERVER_NAME} ${SSL_CERT} ${SSL_KEY} ${HSTS_HEADER}' < "$TEMPLATE" > "$OUTPUT"

# Empêche 20-envsubst de réécrire une conf invalide
rm -f "$TEMPLATE"

echo "[web] Conf écrite: $OUTPUT (ssl_certificate=${SSL_CERT})"
