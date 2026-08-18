# Delta for Notifications

## ADDED Requirements

### Requirement: Re-livraison sur palier

Le dédoublonnage MUST autoriser une nouvelle livraison `sent` par canal pour le même `event_id` lorsqu’un palier (durée / sévérité / suppression) a déclenché un job avec `force`. Sinon MUST rester au plus une livraison `sent` par `(event_id, channel)` pour le premier envoi.

#### Scenario: Deuxième mail après palier

- **GIVEN** un email déjà `sent` pour l’événement
- **WHEN** un job palier `force = true` est traité
- **THEN** un second `AlertDelivery` email est créé

### Requirement: Motif dans le corps (si connu)

Si `delay_reason` est non vide, le corps Email/Teams SHALL inclure une ligne `Motif: …`. MUST omit si `null`.

#### Scenario: Motif absent

- **GIVEN** un retard sans motif source
- **WHEN** la notif part
- **THEN** le corps n’invente pas de motif
