# Proposal: Config ingest en admin

## Why

Provider et tokens ingest étaient dans `.env` : peu pratique pour les ops, et le token ne doit jamais être relu en clair après saisie.

## What Changes

- Config ingest : **3 slots indépendants** (stub / navitia / prim) + `activeProvider`
- Secret write-only ; `tokenPreview` = 5 premiers caractères
- Check API à l’enregistrement du token et à l’activation (`POST /v1/admin/ingest/probe` + probe dans PUT)
- Section admin **Ingest** (cartes par provider)

## Impact

- **MODIFIED** : admin, ingest, baseline secrets
- `app_meta` : clés `ingest_provider`, `ingest_navitia_token`, `ingest_prim_api_key`
