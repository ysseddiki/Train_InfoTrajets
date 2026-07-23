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

echo "Done. Redémarre API/web si besoin."
