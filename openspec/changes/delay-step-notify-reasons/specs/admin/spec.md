# Delta for Admin

## ADDED Requirements

### Requirement: Palier de notif par liaison

La console SHALL exposer `notify_step_minutes` (minutes, 0–60, défaut 5) au même niveau que le seuil de retard. Les deux sens d’une liaison SHALL recevoir la même valeur à l’enregistrement (comme `min_delay_minutes`).

#### Scenario: Palier 10

- **GIVEN** un admin authentifié
- **WHEN** il enregistre une liaison avec palier 10
- **THEN** Aller et Retour ont `notify_step_minutes = 10`
