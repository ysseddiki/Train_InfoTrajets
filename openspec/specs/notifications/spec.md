# Notifications Specification

## Purpose

Envoi d’alertes via Email (serveur SMTP custom) et Microsoft Teams, avec historique de livraison par canal et secrets masqués.

## Requirements

### Requirement: Canaux Email SMTP et Teams

Le système SHALL supporter les canaux `email` (serveur SMTP custom configurable **en admin / DB**) et `teams` (webhook, `.env`), activables indépendamment.

La bibliothèque d’envoi email MUST être maintenue dans une version exempte de vulnérabilité connue d’injection d’en-tête ou de commande SMTP (CRLF) : elle MUST NOT être épinglée sur une version corrigée en amont. `npm audit --audit-level=high` MUST être au vert avant tout commit.

#### Scenario: Dépendance email saine

- **GIVEN** le dépôt à jour
- **WHEN** on exécute `npm audit --audit-level=high`
- **THEN** aucune vulnérabilité n’est signalée sur la chaîne d’envoi email

#### Scenario: Test d’envoi

- **GIVEN** un canal email configuré via `PUT /v1/admin/channels/smtp`
- **WHEN** l’admin appelle `POST /v1/admin/channels/email/test`
- **THEN** un message de test est envoyé via SMTP
- **AND** une `AlertDelivery` de type test est enregistrée

#### Scenario: Mot de passe write-only

- **GIVEN** un SMTP avec mot de passe en base
- **WHEN** `GET /v1/admin/channels/smtp`
- **THEN** la réponse expose `passwordConfigured: true` et MUST NOT inclure le mot de passe

### Requirement: Livraison indépendante par canal

Pour un événement matché, le système MUST tenter chaque canal actif et MUST enregistrer un `AlertDelivery` par canal ; l’échec d’un canal MUST NOT empêcher l’autre.

#### Scenario: Teams en échec, email OK

- **GIVEN** email et Teams actifs
- **WHEN** Teams renvoie une erreur et SMTP réussit
- **THEN** l’email est `sent` et Teams est `failed`

### Requirement: Retard unknown dans le corps de notif

Pour un événement `kind = delay`, le corps Email/Teams MUST inclure la durée : `Retard: N min` si connue, sinon `Retard: unknown` (`delay_minutes` null). MUST NOT omettre la ligne ni écrire `0 min` pour un retard inconnu.

#### Scenario: Retard sans durée

- **GIVEN** un événement `delay` avec `delay_minutes = null`
- **WHEN** une notification est envoyée
- **THEN** le corps contient `Retard: unknown`

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
