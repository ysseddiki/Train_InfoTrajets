# Delta for System

## MODIFIED Requirements

### Requirement: Séparation client/serveur

Le client web MUST n’appeler que l’API HTTP `/v1` ; les intégrations Navitia, SMTP et Teams MUST s’exécuter uniquement côté serveur. MUST NOT appeler les flux ZOU.
