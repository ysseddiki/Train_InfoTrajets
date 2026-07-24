# Delta for Admin

## ADDED Requirements

### Requirement: Configuration ingest en admin

Un admin authentifié SHALL pouvoir lire et mettre à jour la source d’ingest via `GET/PUT /v1/admin/ingest` :

- `provider` : `stub` | `navitia` | `prim`
- secret associé (token Navitia ou clé PRIM) : **write-only**

La réponse publique MUST inclure `tokenConfigured` et, si un secret est présent, `tokenPreview` = les **5 premiers caractères** uniquement. MUST NOT renvoyer le secret complet.

#### Scenario: Lecture masquée

- **GIVEN** un token Navitia stocké commençant par `abc12…`
- **WHEN** l’admin appelle `GET /v1/admin/ingest`
- **THEN** `tokenConfigured` est true et `tokenPreview` vaut `abc12`
- **AND** le corps ne contient pas le reste du token

#### Scenario: Mise à jour sans resaisie

- **GIVEN** un token déjà configuré
- **WHEN** l’admin envoie `PUT` avec un nouveau `provider` et sans `token` (ou token vide)
- **THEN** le secret existant est conservé
