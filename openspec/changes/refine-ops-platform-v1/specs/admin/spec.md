# Delta for Admin

## ADDED Requirements

### Requirement: Console admin authentifiée

La console admin MUST exiger un login simple (session serveur) avant tout accès aux opérations de configuration.

#### Scenario: Accès non authentifié

- **GIVEN** aucune session admin
- **WHEN** un client appelle `GET /v1/admin/journeys`
- **THEN** l’API retourne `401`

### Requirement: Configuration des trajets Aller et Retour

Un admin authentifié SHALL pouvoir créer et mettre à jour les deux trajets (`outbound`, `inbound`) : origine, destination, fenêtre horaire, jours, seuil de retard.

#### Scenario: Mise à jour du trajet Aller

- **GIVEN** un admin authentifié
- **WHEN** il envoie `PUT /v1/admin/journeys/outbound` avec une config valide
- **THEN** le trajet Aller est persisté et renvoyé (sans secrets)

### Requirement: Destinataires email saisis par l’admin

Un admin SHALL pouvoir ajouter et retirer des adresses email destinataires dans l’interface ; ces adresses sont les seules cibles email v1.

#### Scenario: Ajout d’un destinataire

- **GIVEN** un admin authentifié
- **WHEN** il ajoute `ops@example.com` à la liste des destinataires
- **THEN** les prochaines alertes email incluent cette adresse
