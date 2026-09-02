# Notifications — delta security-prod-posture

## MODIFIED Requirements

### Requirement: Canaux Email SMTP et Teams

La bibliothèque d'envoi email MUST être maintenue dans une version exempte de
vulnérabilité connue d'injection d'en-tête ou de commande SMTP (CRLF). La vérification
`npm audit --audit-level=high` MUST être au vert avant tout commit.

#### Scenario: Dépendance email saine

- **GIVEN** le dépôt à jour
- **WHEN** on exécute `npm audit --audit-level=high`
- **THEN** aucune vulnérabilité n'est signalée sur la chaîne d'envoi email
