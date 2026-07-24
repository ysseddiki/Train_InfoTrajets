# Dashboard Specification

## Purpose

Le dashboard est la surface de lecture pour visualiser l’état des trajets Aller/Retour, les stats et l’historique des alertes. Accès sans login applicatif ; protection par le réseau (VPN/firewall).

## Requirements

### Requirement: Dashboard lecture Aller/Retour

Le dashboard SHALL afficher l’état des trajets Aller (`outbound`) et Retour (`inbound`), des statistiques agrégées et l’historique récent des livraisons, sans authentification applicative (protection réseau).

#### Scenario: Affichage des deux sens

- **GIVEN** les trajets Aller et Retour configurés
- **WHEN** un utilisateur du réseau trusté ouvre le dashboard
- **THEN** il voit le statut de chaque sens et les derniers événements

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
