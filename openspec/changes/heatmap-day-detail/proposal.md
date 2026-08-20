# Proposal: Détail jour heatmap

## Why

La heatmap 53 semaines n’expose qu’un score. Ops a besoin, au clic d’un jour, des retards (heures + durées), des motifs, et de la météo de ce jour civil Europe/Paris.

## What Changes

- `GET /v1/dashboard/day?date=YYYY-MM-DD&liaisonId=` (même scope que l’overview)
- Cellules heatmap cliquables → panneau : retards, motifs, météo du jour
- Météo : agrégat Open-Meteo du jour à la gare surveillée ; sinon snapshot des événements. Pas d’invention si inconnu.

## Impact

- **ADDED** : endpoint day detail, UI panneau heatmap
- **MODIFIED** : dashboard heatmap (clic)
