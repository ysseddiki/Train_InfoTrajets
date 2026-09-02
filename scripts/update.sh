#!/usr/bin/env bash
# Mise à jour serveur : aligne le code sur origin/main (ignore le drift npm local).
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Fetch origin"
git fetch origin

branch="$(git rev-parse --abbrev-ref HEAD)"
echo "→ Reset hard sur origin/${branch} (fichiers trackés uniquement ; .env conservé)"
git reset --hard "origin/${branch}"

echo "→ npm install"
npm install

# L'UI est servie en statique par nginx : sans rebuild, le déploiement reste sur
# l'ancienne version du client.
echo "→ Build client (apps/web/dist)"
npm run build -w @sncf-alerts/web

echo "Done. Redémarre les services :"
echo "  sudo systemctl restart sncf-alerts-api sncf-alerts-ingest"
echo "  sudo systemctl reload nginx"
