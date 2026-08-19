# Delta for Dashboard

## ADDED Requirements

### Requirement: Météo et corrélation retards

Le dashboard SHALL afficher la météo actuelle à la gare surveillée (carte Aller/Retour) quand les coordonnées sont connues.

Les agrégats période SHALL inclure un décompte des retards par **bucket météo** (`clear`, `cloudy`, `fog`, `rain`, `snow`, `storm`) avec retard moyen par bucket, et MAY exposer le coefficient de corrélation Pearson entre `precipitation_mm` et `delay_minutes` lorsque au moins 5 retards ont les deux valeurs.

#### Scenario: Pluie et retards

- **GIVEN** 4 retards sous bucket `rain` et 2 sous `clear` sur la journée
- **WHEN** le dashboard charge la période Journée
- **THEN** la section météo liste Pluie (4) et Beau temps (2) avec retards moyens
