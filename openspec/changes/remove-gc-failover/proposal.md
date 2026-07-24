# Proposal: Retrait failover scrape Gares & Connexions

## Why

Le scrape du board public G&C (failover temporaire) est bloqué par Datadome (HTTP 403 / captcha) depuis les IP serveur. Ce n’est pas un filet de secours fiable.

## What Changes

- **REMOVED** : adapter `departures-garesetconnexions`, toggle `gcFailoverEnabled`, source événements `garesetconnexions`, tags `terminusAliases`
- **KEPT** : `displayUrl` catalogue = lien UI « Fiche gare » uniquement (MUST NOT scraper)
- Sources ingest / clear-stats : `stub` \| `navitia` \| `prim` uniquement
- Board : snapshots `navitia` seulement ; libellé erreur ingest = « Ingest en erreur » (pas « Mode G&C »)

## Impact

- **MODIFIED** : `openspec/specs/{ingest,admin,dashboard,system}`, `specs/system/baseline-v1.md`
- Hors scope v1 renforcé : pas de scrape / failover G&C
