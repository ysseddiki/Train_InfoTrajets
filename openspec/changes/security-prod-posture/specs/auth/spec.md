# Auth — delta security-prod-posture

## ADDED Requirements

### Requirement: Limitation de débit du login

Le rate-limit était implémenté sans être spécifié : il est ici formalisé et corrigé
(il comptait toutes les requêtes derrière le reverse-proxy dans un seul compteur).

`POST /v1/admin/login` MUST être limité en débit sur **deux dimensions** :

- par **IP réelle du client** : derrière un reverse-proxy, l'API MUST être configurée avec
  une allowlist d'IP de proxy de confiance (`TRUSTED_PROXIES`) et MUST NOT accepter
  `X-Forwarded-For` d'une source non listée ;
- par **identifiant** visé, afin qu'une attaque distribuée sur un compte soit bridée
  quelle que soit l'IP source.

Chaque dimension MUST appliquer un backoff progressif en cas de saturations répétées.
Un refus MUST répondre `429` avec un en-tête `Retry-After`.

Un succès de connexion MUST NOT réinitialiser le compteur d'une autre IP. Il MAY libérer
le couple (IP, identifiant) concerné — sans quoi un attaquant saturant un identifiant
verrouillerait durablement son titulaire légitime.

#### Scenario: Brute force derrière nginx

- **GIVEN** l'API derrière nginx, `LOGIN_RATE_MAX=10`
- **WHEN** un attaquant depuis `203.0.113.7` échoue 10 fois
- **THEN** il reçoit `429` avec `Retry-After`
- **AND** un opérateur légitime depuis une autre IP peut toujours se connecter

#### Scenario: En-tête forgé

- **GIVEN** une requête atteignant l'API depuis une IP hors allowlist de proxies
- **WHEN** elle porte `X-Forwarded-For: 1.2.3.4`
- **THEN** l'en-tête est ignoré et l'IP de la socket est utilisée pour le comptage

#### Scenario: Compte ciblé depuis plusieurs IP

- **GIVEN** `LOGIN_RATE_MAX_USER` atteint pour l'identifiant `admin`
- **WHEN** une nouvelle tentative sur `admin` arrive depuis une IP encore sous seuil
- **THEN** la tentative est refusée avec `429`

#### Scenario: Succès sans effet de bord

- **GIVEN** une IP attaquante déjà bloquée
- **WHEN** un opérateur se connecte avec succès depuis une autre IP
- **THEN** l'IP attaquante reste bloquée

## MODIFIED Requirements

### Requirement: Login local

Le système SHALL authentifier des comptes locaux (identifiant + mot de passe hashé
serveur) via `POST /v1/admin/login`. Pas d'OIDC en v1. Un compte bootstrap MAY être créé
depuis `ADMIN_USERNAME` / `ADMIN_PASSWORD` au premier boot.

Le bootstrap MUST échouer au démarrage si `NODE_ENV=production` et `ADMIN_PASSWORD` vaut
encore la valeur par défaut (`changeme`).

Le mode production MUST être déterminé de façon fiable : `NODE_ENV=production` MUST être
positionné par les unités de déploiement du dépôt, et non seulement documenté. Le
démarrage MUST émettre un avertissement si `NODE_ENV` est absent alors que
`DATABASE_URL` ne pointe pas vers un hôte local — signe d'un déploiement réel où les
gardes de production sont inactives.

#### Scenario: Login réussi

- **GIVEN** des credentials valides d'un compte non désactivé
- **WHEN** `POST /v1/admin/login` est appelé
- **THEN** une session cookie httpOnly est établie
- **AND** la réponse inclut `username` et `role`

#### Scenario: Login échoué

- **GIVEN** un mot de passe incorrect ou un compte désactivé
- **WHEN** `POST /v1/admin/login` est appelé
- **THEN** l'API retourne `401` sans révéler si l'utilisateur existe

#### Scenario: Bootstrap refusé en production

- **GIVEN** `NODE_ENV=production` et `ADMIN_PASSWORD=changeme` (ou absent)
- **WHEN** l'API démarre
- **THEN** le seed échoue avec une erreur explicite demandant un mot de passe fort

#### Scenario: Garde effective en déploiement

- **GIVEN** un serveur déployé via les unités systemd du dépôt
- **WHEN** `ADMIN_PASSWORD` vaut encore `changeme`
- **THEN** l'API refuse de démarrer (les unités définissent `NODE_ENV=production`)

#### Scenario: Mode production non déclaré

- **GIVEN** `NODE_ENV` absent et `DATABASE_URL` pointant vers un hôte distant
- **WHEN** l'API démarre
- **THEN** un avertissement explicite est journalisé
