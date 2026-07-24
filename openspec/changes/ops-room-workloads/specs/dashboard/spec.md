# Delta for Dashboard

## ADDED Requirements

### Requirement: Lien fiche Gares & Connexions

Chaque carte Aller/Retour du dashboard SHALL afficher un lien « Fiche gare » vers l’URL Gares & Connexions configurée sur la gare surveillée (catalogue), si présente. Le système MUST NOT scraper le site G&C.

#### Scenario: Bouton visible

- **GIVEN** la gare Nice a `displayUrl` renseignée
- **WHEN** l’opérateur ouvre le dashboard
- **THEN** la carte Aller propose un lien externe vers cette URL

### Requirement: Ops room lecture

Le dashboard SHALL présenter une vue ops (statut liaisons A/R en premier, puis indicateurs, puis activité). Les données de démo SHALL être générables depuis Admin → Debug (stub).

#### Scenario: Voir un retard après stub

- **GIVEN** provider stub et admin authentifié
- **WHEN** il injecte un événement stub
- **THEN** le dashboard affiche le statut retard sur la carte concernée après actualisation
