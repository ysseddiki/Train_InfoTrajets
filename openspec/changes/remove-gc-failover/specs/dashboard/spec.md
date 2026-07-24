# Delta for Dashboard

## MODIFIED Requirements

### Requirement: Lien fiche Gares & Connexions

Chaque carte Aller/Retour du dashboard SHALL afficher un lien « Fiche Gares & Connexions » vers l’URL configurée sur la gare surveillée (catalogue), si présente. Le système MUST NOT scraper le site G&C et MUST NOT dépendre de ce lien pour l’ingest ou le prochain train.

#### Scenario: Bouton visible

- **GIVEN** la gare Nice a `displayUrl` renseignée
- **WHEN** l’opérateur ouvre le dashboard
- **THEN** la carte Aller propose un lien externe vers cette URL

## ADDED Requirements

### Requirement: Libellé ingest en erreur

Si le dernier poll ingest a échoué (`last_ingest_status = error`) et qu’aucune donnée board récente n’affine le statut, la carte MUST afficher un libellé du type « Ingest en erreur » (pas « Mode G&C » / « Mode dégradé » lié à un scrape).

#### Scenario: Poll en échec sans snapshot

- **GIVEN** un sens en fenêtre de veille et `last_ingest_status = error` sans `nextDeparture`
- **WHEN** le dashboard charge
- **THEN** le boardStatusLabel indique une erreur d’ingest
