# Proposal: Simplify admin Voyage A/R

## Why

La console admin exposait deux formulaires miroir (Aller / Retour) avec IDs dupliqués, réseau libre et jours en liste numérique — trop complexe pour un seul voyage TER A/R fixe.

## What Changes

- UI admin : **un bloc Voyage A/R** (gares une fois, fenêtres Aller/Retour, jours Semaine/Week-end, TER implicite)
- Mapping client : miroir auto des gares → `PUT` `outbound` + `inbound` inchangés
- Pas de changement de contrat HTTP ni de schéma `JourneyConfig`

## Impact

- **MODIFIED** : UX console admin (présentation voyage unifié)
- Hors scope : autocomplete gares, fusion DB RoundTrip, canaux SMTP/Teams
