# Delta for System

## MODIFIED Requirements

### Requirement: Produit ops interne Aller/Retour

Le système SHALL être un outil ops interne qui surveille une ou plusieurs liaisons (chaque liaison = `outbound` / Aller et `inbound` / Retour), expose un dashboard de lecture et une console admin, et notifie via Email (SMTP) et Teams.

Hors scope v1 explicite : scrape / failover Gares & Connexions (Datadome) ; `displayUrl` = lien UI seulement.

#### Scenario: Périmètre v1

- **GIVEN** le déploiement v1
- **WHEN** un opérateur utilise le produit
- **THEN** seules les surfaces Dashboard et Admin sont disponibles
- **AND** aucun compte voyageur ni canal push n’existe
- **AND** au moins une liaison est configurée (seed par défaut)
- **AND** aucune source d’ingest scrape G&C n’est disponible
