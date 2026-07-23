# Delta for Auth

## ADDED Requirements

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
