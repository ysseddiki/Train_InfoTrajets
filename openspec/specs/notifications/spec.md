# Notifications Specification

## Purpose

Envoi d’alertes via Email (serveur SMTP custom) et Microsoft Teams, avec historique de livraison par canal et secrets masqués.

## Requirements

### Requirement: Canaux Email SMTP et Teams

Le système SHALL supporter les canaux `email` (serveur SMTP custom configurable) et `teams` (webhook), activables indépendamment.

#### Scenario: Test d’envoi

- **GIVEN** un canal email configuré
- **WHEN** l’admin appelle `POST /v1/admin/channels/email/test`
- **THEN** un message de test est envoyé via SMTP
- **AND** une `AlertDelivery` de type test est enregistrée

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
