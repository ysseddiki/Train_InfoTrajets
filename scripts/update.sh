#!/usr/bin/env bash
# Mise à jour serveur : ignore le drift local de package-lock.json puis pull.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "→ Reset package-lock.json local (garder la version du repo)"
git checkout -- package-lock.json

echo "→ git pull"
git pull --ff-only

echo "→ npm ci (install fidèle au lockfile)"
npm ci

echo "Done. Redémarre API/web si besoin."
