# Delta for Auth

## ADDED Requirements

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
