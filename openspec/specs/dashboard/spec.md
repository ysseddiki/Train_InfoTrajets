# Dashboard Specification

## Purpose

Le dashboard est la surface de lecture pour visualiser l’état des **liaisons** (Aller/Retour), les stats et l’historique des alertes. Accès sans login applicatif ; protection par le réseau (VPN/firewall).

## Requirements

### Requirement: Dashboard lecture par liaison

Le dashboard SHALL afficher l’état de chaque liaison (Aller `outbound` + Retour `inbound`), des statistiques agrégées et l’historique récent des livraisons, sans authentification applicative (protection réseau).

#### Scenario: Affichage des liaisons

- **GIVEN** une ou plusieurs liaisons configurées
- **WHEN** un utilisateur du réseau trusté ouvre le dashboard
- **THEN** il voit le statut Aller/Retour de chaque liaison et les derniers événements

#### Scenario: API indisponible

- **GIVEN** l’API serveur est down
- **WHEN** le dashboard charge
- **THEN** une erreur claire est affichée (pas de données inventées en prod)

### Requirement: Stats motifs de retard

Les agrégats période SHALL exposer `today` (jour civil Europe/Paris depuis 00:00), `last24h` (glissant), `week` (lundi 00:00 Paris), `month` (1er du mois 00:00 Paris) et `year` (1er janvier 00:00 Paris). Chaque agrégat SHALL inclure un décompte des retards **par `delay_reason_key`** (top motifs) et le nombre de retards **sans motif**. Un motif manquant MUST NOT être affiché comme une cause inventée. Les champs `last7d` / `last30d` MAY rester en rolling pour compat.

#### Scenario: Mix motifs

- **GIVEN** 3 retards « travaux », 1 sans motif, sur la journée en cours
- **WHEN** le dashboard charge la période Journée
- **THEN** les stats listent travaux (3) et un compteur sans motif (1)

#### Scenario: Sélecteur de période

- **GIVEN** des événements aujourd’hui et d’hier
- **WHEN** l’opérateur passe de « Journée » à « 24 h »
- **THEN** les KPI reflètent la fenêtre choisie (calendaire vs glissante)

### Requirement: Affichage retard unknown

Pour un événement de type retard (`delay`), si `delay_minutes` est `null`, le dashboard MUST afficher `unknown` (cartes, tableaux, libellé board). MUST NOT afficher `0`, `—` ou « Retard détecté » à la place.

#### Scenario: Carte trajet avec retard sans durée

- **GIVEN** le dernier événement Aller est un `delay` avec `delay_minutes = null`
- **WHEN** le dashboard charge
- **THEN** le retard est libellé `unknown`

### Requirement: Lien fiche Gares & Connexions

Chaque carte Aller/Retour du dashboard SHALL afficher un lien « Fiche Gares & Connexions » vers l’URL configurée sur la gare surveillée (catalogue), si présente. Le système MUST NOT scraper le site G&C et MUST NOT dépendre de ce lien pour l’ingest ou le prochain train.

#### Scenario: Bouton visible

- **GIVEN** la gare Nice a `displayUrl` renseignée
- **WHEN** l’opérateur ouvre le dashboard
- **THEN** la carte Aller propose un lien externe vers cette URL

### Requirement: Libellé ingest en erreur

Si le dernier poll ingest a échoué (`last_ingest_status = error`) et qu’aucune donnée board récente n’affine le statut, la carte MUST afficher un libellé du type « Ingest en erreur » (pas un mode scrape G&C).

#### Scenario: Poll en échec sans snapshot

- **GIVEN** un sens en fenêtre de veille et `last_ingest_status = error` sans `nextDeparture`
- **WHEN** le dashboard charge
- **THEN** le boardStatusLabel indique une erreur d’ingest

### Requirement: Ops room lecture

Le dashboard SHALL présenter une vue ops (statut liaisons A/R en premier, puis indicateurs, puis fil d’activité). Les données de démo SHALL être générables depuis Admin → Debug (stub).

#### Scenario: Voir un retard après stub

- **GIVEN** provider stub et admin authentifié
- **WHEN** il injecte un événement stub
- **THEN** le dashboard affiche le statut retard sur la carte concernée après actualisation

### Requirement: Libellé hors fenêtre de veille

Hors fenêtre de veille (et trajet actif), le board MUST indiquer un statut `outside_window` (ex. « Hors fenêtre de veille »), distinct de la pause (`active = false`).

#### Scenario: Avant le lead

- **GIVEN** Aller actif, trajet 07:00–09:30, lead 4 h, pas de veille continue
- **WHEN** il est 02:00 Europe/Paris un jour surveillé
- **THEN** le board Aller est `outside_window`

#### Scenario: Pendant le lag

- **GIVEN** Aller actif, trajet 07:00–09:30, pas de veille continue
- **WHEN** il est 10:00 Europe/Paris
- **THEN** le board n’est pas `outside_window` (lag 2 h)
