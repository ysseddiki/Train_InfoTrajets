# Delta for System

## MODIFIED Requirements

### Requirement: Produit ops interne Aller/Retour

Le système SHALL être un outil ops interne qui surveille une ou plusieurs liaisons (chaque liaison = `outbound` / Aller et `inbound` / Retour), expose un dashboard de lecture (session ou visiteur) et une console admin selon le rôle, et notifie via Email (SMTP) et Teams. Les comptes sont **locaux** (un rôle parmi `reader`, `liaison_editor`, `admin`), créés par un admin. Pas de comptes voyageurs B2C ni de canal push.

#### Scenario: Périmètre

- **GIVEN** le déploiement
- **WHEN** un opérateur utilise le produit
- **THEN** les surfaces Dashboard, Notifications et Admin (filtrée) sont disponibles
- **AND** aucun compte voyageur ni canal push n’existe
- **AND** au moins une liaison est configurée (seed par défaut)
- **AND** aucune source d’ingest scrape Gares & Connexions n’est disponible
