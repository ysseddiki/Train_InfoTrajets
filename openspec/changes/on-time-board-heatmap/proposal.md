# Proposal: On-time ingest + board = prochain train + heatmap pondérée

## Why

L’ingest ne crée aujourd’hui que des alertes retard/suppression. Les jours « calmes » restent souvent gris sur la heatmap, et le board peut afficher « À l’heure » dès que le dernier poll est OK — sans lien avec le prochain train.

## What Changes

- Ingest Navitia : pour chaque départ surveillé, enregistrer une observation train (`on_time` | `delayed` | `cancelled`) idempotente
- Heatmap : jour observé si au moins un train ; score retard dilué par le volume de trains à l’heure
- Board « Statut en cours » : statut = prochain train (snapshot), jamais « ingest OK ⇒ à l’heure »

## Impact

- ADDED : `board_train_observations` ; colonnes compteurs sur `board_day_observations`
- MODIFIED : ingest, store overview/heatmap, specs ingest/dashboard
