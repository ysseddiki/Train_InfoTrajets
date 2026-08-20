# Delta for Dashboard

## ADDED Requirements

### Requirement: Détail jour heatmap

Un clic sur un jour de la heatmap (passé ou aujourd’hui, Europe/Paris) SHALL charger le détail de ce jour civil, filtré comme l’overview (`liaisonId` ou toutes les liaisons). Le détail MUST lister les retards et suppressions (heure Paris, durée, motif si connu), les comptes de motifs, et la météo du jour (Open-Meteo daily à la gare surveillée, ou snapshot d’événement à défaut). MUST NOT inventer motif ni météo. Les jours futurs MUST NOT être cliquables.

#### Scenario: Jour avec retards

- **GIVEN** deux retards le 2026-08-18 (12 min « travaux », 8 min sans motif) sous pluie
- **WHEN** l’opérateur clique la cellule de ce jour
- **THEN** le panneau affiche les deux horaires et durées, le motif travaux, un retard sans motif, et la météo du jour (pluie) si connue

#### Scenario: Jour sans retard

- **GIVEN** un jour observé sans retard (cellule verte)
- **WHEN** l’opérateur clique cette cellule
- **THEN** le panneau indique qu’il n’y a aucun retard et affiche la météo du jour si elle est connue
