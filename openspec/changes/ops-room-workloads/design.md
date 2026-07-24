# Design: Ops room & workloads (adminsys)

## Audience

Ops / adminsys — pas besoin d’être full-stack pour déployer.

## Décisions figées

| Sujet | Décision |
|--------|----------|
| Scrape Gares & Connexions | **Non** |
| Lien fiche G&C | **Oui** sur statut A/R (URL du catalogue gares) |
| Filtre destination | **Gare desservie** sur le parcours (pas forcément terminus) |
| Navitia sans token | Stub + debug admin pour peupler l’ops room |
| Token Navitia | Admin DB uniquement — **retiré du `.env`** |
| Prometheus | Plus tard |
| Recherche gares | Catalogue manuel ; validation à l’**Entrée** / submit |

## Processus systemd

```text
sncf-alerts-api.service      → HTTP /v1 seulement (INGEST_IN_PROCESS=false)
sncf-alerts-ingest.service   → poll + match + enqueue notifs
sncf-alerts-web (optionnel)  → vite/nginx — hors scope units si reverse-proxy existant
```

Fichiers : `deploy/systemd/*.service` — copier vers `/etc/systemd/system/`, `daemon-reload`, `enable --now`.

## Cache départs

Mémoire process ingest, TTL 90 s par `(stopId)`. 2 polls proches = 1 appel Navitia.

## File notify_jobs

Ingest crée l’événement → insert `notify_jobs` → worker (même process ingest) drain la file et appelle SMTP/Teams. L’API HTTP ne bloque pas sur l’envoi mail.

## Ports

- `DeparturesPort` : stub | navitia
- Pas de `StationInfoPort` scrape ; URLs G&C = données catalogue

## Ops room UI

Dashboard = mur de statut (cartes liaison A/R) + indicateurs + activité.  
Debug : Admin → Debug (inject / historique stub) puis retour Dashboard.
