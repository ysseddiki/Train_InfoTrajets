# Auth Specification

## Purpose

Authentification locale (login/mot de passe, session serveur). Plusieurs comptes, un rôle chacun. Pas d’inscription publique ni d’OIDC en v1. Le dashboard est accessible avec une session **ou** le mode visiteur.

## Requirements

### Requirement: Login local

Le système SHALL authentifier des comptes locaux (identifiant + mot de passe hashé serveur) via `POST /v1/admin/login`. Pas d’OIDC en v1. Un compte bootstrap MAY être créé depuis `ADMIN_USERNAME` / `ADMIN_PASSWORD` au premier boot.

#### Scenario: Login réussi

- **GIVEN** des credentials valides d’un compte non désactivé
- **WHEN** `POST /v1/admin/login` est appelé
- **THEN** une session cookie httpOnly est établie
- **AND** la réponse inclut `username` et `role`

#### Scenario: Login échoué

- **GIVEN** un mot de passe incorrect ou un compte désactivé
- **WHEN** `POST /v1/admin/login` est appelé
- **THEN** l’API retourne `401` sans révéler si l’utilisateur existe

### Requirement: Pas d’inscription publique

Le système MUST NOT exposer d’endpoint d’inscription publique. Seul un compte `admin` SHALL pouvoir créer et désactiver des comptes.

#### Scenario: Pas d’endpoint register

- **GIVEN** le déploiement
- **WHEN** un client cherche un endpoint d’inscription publique
- **THEN** aucun endpoint de ce type n’est disponible

### Requirement: Changement du mot de passe

Un utilisateur authentifié SHALL pouvoir changer **son** mot de passe via `PUT /v1/admin/account/password` avec `currentPassword` et `newPassword`. Le nouveau mot de passe MUST faire au moins 8 caractères. Le serveur MUST vérifier le mot de passe actuel, MUST hasher le nouveau, et MUST NOT renvoyer ni logger la valeur en clair.

#### Scenario: Changement réussi

- **GIVEN** un utilisateur authentifié
- **WHEN** il envoie un mot de passe actuel valide et un nouveau d’au moins 8 caractères
- **THEN** le hash est mis à jour
- **AND** la réponse n’inclut pas le mot de passe

#### Scenario: Mot de passe actuel faux

- **GIVEN** un utilisateur authentifié
- **WHEN** `currentPassword` est incorrect
- **THEN** l’API retourne `401` et le hash n’est pas modifié

### Requirement: Rôles exclusifs

Chaque compte MUST avoir exactement un rôle parmi `reader`, `liaison_editor`, `admin`. `GET /v1/admin/me` MUST renvoyer `{ username, role }`.

#### Scenario: Session reader

- **GIVEN** un compte `reader` connecté
- **WHEN** `GET /v1/admin/me` est appelé
- **THEN** `role` vaut `reader`

### Requirement: Mode visiteur

Le système SHALL exposer `GET /v1/auth/config` (public) `{ visitorEnabled }`. Un admin SHALL pouvoir activer ou désactiver le mode via `GET/PUT /v1/admin/settings/access`. Défaut : visiteur **activé**.

Les routes de lecture dashboard (`/v1/dashboard/overview`, `/v1/liaisons`, `/v1/journeys`, `/v1/events`, `/v1/deliveries`) MUST exiger une session **ou** `visitorEnabled = true`. Sinon `401`.

#### Scenario: Visiteur désactivé sans session

- **GIVEN** `visitorEnabled = false` et aucune session
- **WHEN** un client appelle `GET /v1/dashboard/overview`
- **THEN** l’API retourne `401`

#### Scenario: Visiteur activé

- **GIVEN** `visitorEnabled = true` et aucune session
- **WHEN** un client appelle `GET /v1/dashboard/overview`
- **THEN** l’API retourne `200` avec l’overview

### Requirement: Gestion des comptes par un admin

Un `admin` SHALL pouvoir lister, créer et modifier des comptes (`GET/POST /v1/admin/users`, `PATCH /v1/admin/users/:id` : rôle, désactivation, reset mot de passe). Les réponses MUST NOT inclure hash ni mot de passe. Le système MUST refuser de désactiver ou rétrograder le dernier `admin` actif (`400`).

#### Scenario: Création

- **GIVEN** un admin authentifié
- **WHEN** il crée un compte `reader` avec mot de passe ≥ 8 caractères
- **THEN** le compte est persisté et renvoyé sans secret

#### Scenario: Dernier admin

- **GIVEN** un seul compte `admin` actif
- **WHEN** il tente de le désactiver ou de passer son rôle à `reader`
- **THEN** l’API retourne `400`
