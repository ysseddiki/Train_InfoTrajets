# Auth Specification

## Purpose

Authentification locale (login/mot de passe, session serveur). Plusieurs comptes, un rôle chacun. Pas d’inscription publique ni d’OIDC en v1. Le dashboard est accessible avec une session **ou** le mode visiteur.

## Requirements

### Requirement: Login local

Le système SHALL authentifier des comptes locaux (identifiant + mot de passe hashé serveur) via `POST /v1/admin/login`. Pas d’OIDC en v1. Un compte bootstrap MAY être créé depuis `ADMIN_USERNAME` / `ADMIN_PASSWORD` au premier boot.

Le bootstrap MUST échouer au démarrage si `NODE_ENV=production` et `ADMIN_PASSWORD` vaut encore la valeur par défaut (`changeme`).

Le mode production MUST être déterminé de façon fiable : `NODE_ENV=production` MUST être positionné par les unités de déploiement du dépôt, et non seulement documenté. Le démarrage MUST émettre un avertissement si `NODE_ENV` est absent alors que `DATABASE_URL` ne pointe pas vers un hôte local — signe d’un déploiement réel où les gardes de production sont inactives.

#### Scenario: Login réussi

- **GIVEN** des credentials valides d’un compte non désactivé
- **WHEN** `POST /v1/admin/login` est appelé
- **THEN** une session cookie httpOnly est établie
- **AND** la réponse inclut `username` et `role`

#### Scenario: Login échoué

- **GIVEN** un mot de passe incorrect ou un compte désactivé
- **WHEN** `POST /v1/admin/login` est appelé
- **THEN** l’API retourne `401` sans révéler si l’utilisateur existe

#### Scenario: Bootstrap refusé en production

- **GIVEN** `NODE_ENV=production` et `ADMIN_PASSWORD=changeme` (ou absent)
- **WHEN** l’API démarre
- **THEN** le seed échoue avec une erreur explicite demandant un mot de passe fort

#### Scenario: Garde effective en déploiement

- **GIVEN** un serveur déployé via les unités systemd du dépôt
- **WHEN** `ADMIN_PASSWORD` vaut encore `changeme`
- **THEN** l’API refuse de démarrer (les unités définissent `NODE_ENV=production`)

#### Scenario: Mode production non déclaré

- **GIVEN** `NODE_ENV` absent et `DATABASE_URL` pointant vers un hôte distant
- **WHEN** l’API démarre
- **THEN** un avertissement explicite est journalisé

### Requirement: Limitation de débit du login

`POST /v1/admin/login` MUST être limité en débit sur **deux dimensions** :

- par **IP réelle du client** : derrière un reverse-proxy, l’API MUST être configurée avec une allowlist d’IP de proxy de confiance (`TRUSTED_PROXIES`) et MUST NOT accepter `X-Forwarded-For` d’une source non listée ;
- par **identifiant** visé, afin qu’une attaque distribuée sur un compte soit bridée quelle que soit l’IP source.

Chaque dimension MUST appliquer un backoff progressif en cas de saturations répétées. Un refus MUST répondre `429` avec un en-tête `Retry-After`.

Un succès de connexion MUST NOT réinitialiser le compteur d’une autre IP. Il MAY libérer le couple (IP, identifiant) concerné — sans quoi un attaquant saturant un identifiant verrouillerait durablement son titulaire légitime.

#### Scenario: Brute force derrière nginx

- **GIVEN** l’API derrière nginx, `LOGIN_RATE_MAX=10`
- **WHEN** un attaquant depuis `203.0.113.7` échoue 10 fois
- **THEN** il reçoit `429` avec `Retry-After`
- **AND** un opérateur légitime depuis une autre IP peut toujours se connecter

#### Scenario: En-tête forgé

- **GIVEN** une requête atteignant l’API depuis une IP hors allowlist de proxies
- **WHEN** elle porte `X-Forwarded-For: 1.2.3.4`
- **THEN** l’en-tête est ignoré et l’IP de la socket est utilisée pour le comptage

#### Scenario: Compte ciblé depuis plusieurs IP

- **GIVEN** `LOGIN_RATE_MAX_USER` atteint pour l’identifiant `admin`
- **WHEN** une nouvelle tentative sur `admin` arrive depuis une IP encore sous seuil
- **THEN** la tentative est refusée avec `429`

#### Scenario: Succès sans effet de bord

- **GIVEN** une IP attaquante déjà bloquée
- **WHEN** un opérateur se connecte avec succès depuis une autre IP
- **THEN** l’IP attaquante reste bloquée

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

Le client MUST adopter une posture **fail-closed** : si `GET /v1/auth/config` échoue, le mode visiteur MUST être considéré désactivé côté UI (porte d’entrée connexion, pas d’accès anonyme par défaut).

#### Scenario: Visiteur désactivé sans session

- **GIVEN** `visitorEnabled = false` et aucune session
- **WHEN** un client appelle `GET /v1/dashboard/overview`
- **THEN** l’API retourne `401`

#### Scenario: Visiteur activé

- **GIVEN** `visitorEnabled = true` et aucune session
- **WHEN** un client appelle `GET /v1/dashboard/overview`
- **THEN** l’API retourne `200` avec l’overview

#### Scenario: Config illisible côté client

- **GIVEN** l’API `/v1/auth/config` en erreur ou injoignable
- **WHEN** la web UI initialise l’auth
- **THEN** `visitorEnabled` est traité comme `false` côté client
- **AND** la porte d’entrée affiche la connexion

### Requirement: Gestion des comptes par un admin

Un `admin` SHALL pouvoir lister, créer et modifier des comptes (`GET/POST /v1/admin/users`, `PATCH /v1/admin/users/:id` : rôle, désactivation, reset mot de passe). Les réponses MUST NOT inclure hash ni mot de passe. Le système MUST refuser de désactiver ou rétrograder le dernier `admin` actif (`400`).

Le reset de mot de passe côté UI MUST passer par un formulaire masqué validant la longueur minimale (`ADMIN_PASSWORD_MIN_LENGTH`) — jamais par une invite système non masquée.

#### Scenario: Création

- **GIVEN** un admin authentifié
- **WHEN** il crée un compte `reader` avec mot de passe ≥ 8 caractères
- **THEN** le compte est persisté et renvoyé sans secret

#### Scenario: Dernier admin

- **GIVEN** un seul compte `admin` actif
- **WHEN** il tente de le désactiver ou de passer son rôle à `reader`
- **THEN** l’API retourne `400`
