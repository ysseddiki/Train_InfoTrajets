# Dashboard Specification

## Purpose

Le dashboard est la surface de lecture pour visualiser l’état des **liaisons** (Aller/Retour), les stats et l’historique des alertes. Accès : session authentifiée, **ou** mode visiteur activé. Porte d’entrée (Connexion / Continuer en visiteur) avant le shell.

## Requirements

### Requirement: Dashboard lecture par liaison

Le dashboard SHALL afficher l’état de chaque liaison (Aller `outbound` + Retour `inbound`), des statistiques agrégées et l’historique récent des livraisons. L’accès applicatif MUST être : session authentifiée, **ou** mode visiteur activé. Le client MUST présenter une porte d’entrée (Connexion / Continuer en visiteur) avant le shell si l’utilisateur n’est pas connecté et n’a pas choisi le mode visiteur.

#### Scenario: Affichage des liaisons (visiteur)

- **GIVEN** une ou plusieurs liaisons configurées et le mode visiteur activé
- **WHEN** un visiteur a choisi « Continuer en visiteur »
- **THEN** il voit le statut Aller/Retour de chaque liaison et les derniers événements

#### Scenario: Login obligatoire

- **GIVEN** le mode visiteur désactivé et aucune session
- **WHEN** un client ouvre l’app
- **THEN** seule la porte d’entrée (connexion) est affichée
- **AND** les APIs dashboard répondent `401`

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

### Requirement: Météo et corrélation retards

Le dashboard SHALL afficher la météo actuelle à la gare surveillée (carte Aller/Retour) quand les coordonnées sont connues.

Les agrégats période SHALL inclure un décompte des retards par **bucket météo** (`clear`, `cloudy`, `fog`, `rain`, `snow`, `storm`) avec retard moyen par bucket, et MAY exposer le coefficient de corrélation Pearson entre `precipitation_mm` et `delay_minutes` lorsque au moins 5 retards ont les deux valeurs.

#### Scenario: Pluie et retards

- **GIVEN** 4 retards sous bucket `rain` et 2 sous `clear` sur la journée
- **WHEN** le dashboard charge la période Journée
- **THEN** la section météo liste Pluie (4) et Beau temps (2) avec retards moyens

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

### Requirement: Statut en cours = prochain train

Le bandeau de statut d’une carte Aller/Retour MUST refléter le **prochain train** surveillé (`nextDeparture` : à l’heure / retard / supprimé), pas le seul succès du dernier poll ni le dernier événement d’alerte. Si aucun prochain train n’est disponible en fenêtre, le statut MUST être `no_data` (ex. « Pas de prochain train »), même si `last_ingest_status = ok`.

#### Scenario: Poll OK sans prochain train

- **GIVEN** un sens en fenêtre, dernier ingest `ok`, pas de `nextDeparture`
- **WHEN** le dashboard charge
- **THEN** le board n’affiche pas « À l’heure » pour cause de poll OK
- **AND** le libellé indique l’absence de prochain train

#### Scenario: Prochain train en retard

- **GIVEN** un `nextDeparture` avec `status = delayed`
- **WHEN** le dashboard charge
- **THEN** `boardStatus` / `boardStatusLabel` correspondent à ce train

### Requirement: Heatmap pondérée trains à l’heure

La heatmap MUST colorer un jour seulement s’il y a observation (trains surveillés et/ou événements). Un jour avec trains à l’heure et sans retard MUST être vert. Le score d’intensité MUST être dilué par le volume de trains à l’heure observés ce jour.

#### Scenario: Journée calme observée

- **GIVEN** des observations `on_time` sans événement retard/suppression ce jour
- **WHEN** le dashboard charge la heatmap
- **THEN** le jour est présent avec `count = 0` (vert) et `onTimeCount > 0`

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
