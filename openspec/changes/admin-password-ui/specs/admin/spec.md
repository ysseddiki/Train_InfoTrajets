# Delta for Admin

## ADDED Requirements

### Requirement: Formulaire mot de passe admin

La console SHALL exposer une section Compte permettant de changer le mot de passe (actuel, nouveau, confirmation). MUST NOT préremplir ni afficher le mot de passe existant.

#### Scenario: Confirmation

- **GIVEN** un admin sur la section Compte
- **WHEN** nouveau et confirmation diffèrent
- **THEN** le client n’envoie pas la requête
