# Proposal: Météo et corrélation retards

## Why

Ops veut voir si les retards coïncident avec la pluie, le vent, etc. Aujourd’hui seuls les motifs Navitia sont agrégés.

## What Changes

- Open-Meteo (serveur, sans clé) : snapshot météo à la gare surveillée lors de chaque événement retard/suppression
- Coordonnées gares (lat/lon) en catalogue + géocodage best-effort
- Dashboard : météo actuelle sur les cartes + agrégats retards par conditions + corrélation Pearson précipitation ↔ durée
- Stub : météo synthétique pour l’historique démo

## Impact

- **ADDED** : ingest météo, dashboard stats météo
- **MODIFIED** : `Station`, `DisruptionEvent`, `DashboardPeriodStats`
