# Auth Specification

## Purpose

Authentification admin simple (login/mot de passe, session serveur). Pas de comptes viewer ni d’inscription publique en v1. Le dashboard s’appuie sur la restriction réseau.

## Requirements

### Requirement: Login admin simple

Le système SHALL authentifier un compte admin unique via identifiant + mot de passe (hash serveur), sans SSO en v1.

#### Scenario: Login réussi

- **GIVEN** des credentials admin valides
- **WHEN** `POST /v1/admin/login` est appelé
- **THEN** une session authentifiée est établie (cookie httpOnly)

#### Scenario: Login échoué

- **GIVEN** un mot de passe incorrect
- **WHEN** `POST /v1/admin/login` est appelé
- **THEN** l’API retourne `401` sans révéler si l’utilisateur existe

### Requirement: Pas de comptes viewer en v1

Le système MUST NOT exposer d’inscription ni de comptes viewer ; l’accès dashboard repose sur la restriction réseau.

#### Scenario: Pas d’endpoint register

- **GIVEN** le déploiement v1
- **WHEN** un client cherche un endpoint d’inscription publique
- **THEN** aucun endpoint de ce type n’est disponible

### Requirement: Changement du mot de passe admin

Un admin authentifié SHALL pouvoir changer le mot de passe du compte via `PUT /v1/admin/account/password` avec `currentPassword` et `newPassword`. Le nouveau mot de passe MUST faire au moins 8 caractères. Le serveur MUST vérifier le mot de passe actuel, MUST hasher le nouveau (bcrypt/argon2), et MUST NOT renvoyer ni logger la valeur en clair.

Si le mot de passe actuel est incorrect, l’API MUST répondre `401`. Si le nouveau mot de passe est trop court, `400`.

#### Scenario: Changement réussi

- **GIVEN** un admin authentifié
- **WHEN** il envoie un mot de passe actuel valide et un nouveau d’au moins 8 caractères
- **THEN** le hash est mis à jour
- **AND** la réponse n’inclut pas le mot de passe

#### Scenario: Mot de passe actuel faux

- **GIVEN** un admin authentifié
- **WHEN** `currentPassword` est incorrect
- **THEN** l’API retourne `401` et le hash n’est pas modifié
