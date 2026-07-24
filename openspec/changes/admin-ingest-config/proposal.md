# Proposal: Config ingest en admin

## Why

Provider et tokens ingest étaient dans `.env` : peu pratique pour les ops, et le token ne doit jamais être relu en clair après saisie.

## What Changes

- Config ingest (provider `stub` | `navitia` | `prim` + secret) persistée en admin (`GET/PUT /v1/admin/ingest`)
- Secret write-only : à la lecture, `tokenConfigured` + `tokenPreview` (5 premiers caractères uniquement)
- Poll lit la config DB (plus `INGEST_PROVIDER` / `NAVITIA_TOKEN` comme source de vérité) ; bootstrap optionnel depuis env au premier démarrage
- Section admin **Ingest**

## Impact

- **MODIFIED** : admin, ingest, baseline secrets
- `app_meta` : clés `ingest_provider`, `ingest_navitia_token`, `ingest_prim_api_key`
