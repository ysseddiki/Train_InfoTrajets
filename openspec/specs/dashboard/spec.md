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

### Requirement: Affichage retard unknown

Pour un événement de type retard (`delay`), si `delay_minutes` est `null`, le dashboard MUST afficher `unknown` (cartes, tableaux, libellé board). MUST NOT afficher `0`, `—` ou « Retard détecté » à la place.

#### Scenario: Carte trajet avec retard sans durée

- **GIVEN** le dernier événement Aller est un `delay` avec `delay_minutes = null`
- **WHEN** le dashboard charge
- **THEN** le retard est libellé `unknown`

### Requirement: Libellé hors fenêtre de veille

Hors fenêtre de veille (et trajet actif), le board MUST indiquer un statut `outside_window` (ex. « Hors fenêtre de veille »), distinct de la pause (`active = false`).

#### Scenario: Avant le lead

- **GIVEN** Aller actif, trajet 07:00–09:30, lead 4 h, pas de veille continue
- **WHEN** il est 02:00 Europe/Paris un jour surveillé
- **THEN** le board Aller est `outside_window`
