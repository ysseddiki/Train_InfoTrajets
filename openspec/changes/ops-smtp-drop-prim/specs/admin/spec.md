## ADDED Requirements

### Requirement: SMTP en base (admin)

Un admin authentifié SHALL pouvoir configurer SMTP via `GET/PUT /v1/admin/channels/smtp` avec secrets write-only. Bootstrap `.env` MAY remplir les meta vides une fois.

### Requirement: Autocomplete gares liaison

La sélection de gare d’une liaison SHALL afficher la liste complète du catalogue avec un champ de recherche pour filtrer.

### Requirement: ZOU matching renforcé

Le failover ZOU SHALL utiliser `stop_times` GTFS static et MAY fusionner plusieurs feeds TripUpdates.

## REMOVED Requirements

### Requirement: Provider PRIM

Le provider `prim` MUST NOT être sélectionnable comme ingest actif.
