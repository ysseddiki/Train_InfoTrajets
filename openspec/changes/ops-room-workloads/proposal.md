# Proposal: Ops room, G&C link, workloads, cache, queue

## Why

L’outil est déjà multi-liaisons + React. Il manque le cadrage ops (adminsys), le lien fiche Gares & Connexions, la séparation API/ingest, le cache Navitia, une file de notifs, et clarifier que le filtre = **gare desservie** (pas forcément terminus).

Pas d’accès Navitia encore → stub/debug pour valider l’ops room ; **pas de scrape** G&C.

## What Changes

- OpenSpec + baseline : modèle écran gare + filtre gare desservie ; hors scope scrape G&C
- Bouton **Fiche G&C** sur les cartes A/R (URL catalogue stations)
- Ops room dashboard + génération debug (admin) pour voir le rendu
- Workloads séparés : `api` vs `ingest` + unités **systemd**
- Cache départs TTL ; token Navitia **uniquement en DB admin** (plus dans `.env`)
- File d’événements notifs (`notify_jobs`)
- Ports `DeparturesPort` ; tests unitaires matching
- Recherche gares : saisie manuelle catalogue (Entrée pour valider formulaires) — pas d’API places tant que pas de token

## Impact

- ADDED : worker ingest, systemd, cache, queue, tests, specs
- MODIFIED : JourneyCard, overview (URLs G&C), `.env.example`, matching docs
- REMOVED : bootstrap `NAVITIA_TOKEN` depuis `.env` (admin only)
