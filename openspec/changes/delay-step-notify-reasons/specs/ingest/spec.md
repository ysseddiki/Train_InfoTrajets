# Delta for Ingest

## ADDED Requirements

### Requirement: Palier de re-notification

Après le premier événement éligible, les polls suivants MUST mettre à jour `delay_minutes` / sévérité / motif sur le même `external_event_id`. Une **nouvelle** notification SHALL être enfilée seulement si :

- le retard connu a augmenté d’au moins `notify_step_minutes` **depuis la dernière notif** (`notified_delay_minutes`), ou
- la sévérité a augmenté, ou
- le `kind` passe à `cancellation`

`notify_step_minutes` ∈ [0, 60], défaut 5. Si `0`, MUST NOT re-notifier pour une hausse de durée (sévérité / suppression restent éligibles). Une baisse de retard MUST NOT déclencher de notif. Le board MUST continuer à se mettre à jour à chaque poll.

#### Scenario: Palier +5

- **GIVEN** un événement déjà notifié à 12 min, `notify_step_minutes = 5`
- **WHEN** un poll voit 18 min
- **THEN** l’événement est mis à jour à 18
- **AND** une nouvelle notif est enfilée

#### Scenario: Sous le palier

- **GIVEN** notifié à 12 min, palier 5
- **WHEN** un poll voit 14 min
- **THEN** `delay_minutes` est 14
- **AND** aucune notif n’est enfilée

### Requirement: Motif de retard optionnel

L’ingest SHALL persister `delay_reason` (texte affichable) et `delay_reason_key` (clé de regroupement stats) quand la source en fournit, sinon `null`. MUST NOT inventer un motif. MUST NOT créer d’événement à partir d’une Service Alert ZOU seule.

Navitia : messages / cause des `disruptions` liées au départ. ZOU : texte d’une Service Alert uniquement si `informed_entity.trip_id` correspond au TripUpdate.

#### Scenario: Navitia avec disruption

- **GIVEN** un départ Navitia lié à une disruption « travaux »
- **WHEN** un retard éligible est ingéré
- **THEN** `delay_reason_key` reflète la cause / catégorie
- **AND** `delay_reason` MAY contenir le message

#### Scenario: ZOU sans alerte trip

- **GIVEN** un TripUpdate retard sans Service Alert pour ce `trip_id`
- **WHEN** l’événement ZOU est créé
- **THEN** `delay_reason` est `null`
