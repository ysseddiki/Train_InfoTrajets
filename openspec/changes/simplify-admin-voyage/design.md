# Design: Simplify admin Voyage A/R

## Context

L’ingest Navitia surveille les **départs** d’une gare filtrés vers une destination. Le modèle reste donc deux `JourneyConfig` (`outbound` / `inbound`).

## Approach

1. La console présente un formulaire **Voyage A/R** dérivé de `outbound` (gare A = origin, gare B = destination) + fenêtres/actif de chaque sens.
2. À l’enregistrement, le client construit :
   - outbound : origin=A, destination=B
   - inbound : origin=B, destination=A
   - `network: "ter"`, labels auto, `daysOfWeek` depuis Semaine `[1..5]` / Week-end `[6,7]`
3. Deux `PUT /v1/admin/journeys/:direction` en parallèle.

## Non-goals

- Endpoint voyage unique côté API
- Recherche / autocomplete Navitia
