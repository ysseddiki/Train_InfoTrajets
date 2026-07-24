# Admin Specification

## Purpose

La console d’administration permet à un admin authentifié de configurer les trajets Aller/Retour, le SMTP, les destinataires email, le canal Teams, et de lancer des tests d’envoi.

## Requirements

### Requirement: Console admin authentifiée

La console admin MUST exiger un login simple (session serveur) avant tout accès aux opérations de configuration.

#### Scenario: Accès non authentifié

- **GIVEN** aucune session admin
- **WHEN** un client appelle `GET /v1/admin/journeys`
- **THEN** l’API retourne `401`

### Requirement: Configuration des trajets Aller et Retour

Un admin authentifié SHALL pouvoir créer et mettre à jour les deux trajets (`outbound`, `inbound`) : origine, destination, fenêtre horaire, jours, seuil de retard. L’interface MAY unifier la saisie en un voyage A/R tout en conservant les endpoints par `direction`.

#### Scenario: Mise à jour du trajet Aller

- **GIVEN** un admin authentifié
- **WHEN** il envoie `PUT /v1/admin/journeys/outbound` avec une config valide
- **THEN** le trajet Aller est persisté et renvoyé (sans secrets)

### Requirement: Console voyage A/R unifié

La console admin SHALL présenter la configuration des trajets comme **un seul voyage aller-retour** : une paire de gares (miroir automatique Aller/Retour), fenêtres horaires distinctes par sens, jours via Semaine / Week-end, réseau TER implicite (pas de choix réseau dans l’UI).

#### Scenario: Enregistrement du voyage

- **GIVEN** un admin authentifié sur la console
- **WHEN** il saisit gare A, gare B, fenêtres Aller/Retour et jours Semaine et/ou Week-end, puis enregistre
- **THEN** le client persiste `outbound` (A→B) et `inbound` (B→A) via les `PUT /v1/admin/journeys/:direction` existants avec `network` TER

#### Scenario: Pas de choix réseau

- **GIVEN** la console admin voyage
- **WHEN** l’admin configure le voyage
- **THEN** aucun champ réseau n’est proposé ; la valeur persistée est TER

### Requirement: Destinataires email saisis par l’admin

Un admin SHALL pouvoir ajouter et retirer des adresses email destinataires dans l’interface ; ces adresses sont les seules cibles email v1.

#### Scenario: Ajout d’un destinataire

- **GIVEN** un admin authentifié
- **WHEN** il ajoute `ops@example.com` à la liste des destinataires
- **THEN** les prochaines alertes email incluent cette adresse
