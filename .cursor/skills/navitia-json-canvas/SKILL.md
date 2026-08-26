---
name: navitia-json-canvas
description: >-
  Analyse les réponses JSON Navitia (départs, disruptions, suppressions) pour
  SNCF-Alerts et présente le résultat dans un Cursor Canvas. Use when the user
  pastes or points to Navitia JSON, asks why a train is/isn't cancelled delayed
  or missing vs Gares & Connexions, debugs ingest matching, or wants a visual
  breakdown of departures / disruptions / stop statuses.
---

# Navitia JSON → Canvas (SNCF-Alerts)

## Quand appliquer

- JSON Navitia collé / fichier / log Admin Debug
- Écart board app vs Gares & Connexions (horaire, retard, suppression)
- « Pourquoi ce train n’est pas cancelled / matché ? »

Lire aussi la skill **canvas** avant d’écrire un `.canvas.tsx`.

## Contraintes produit

- Source board = **Navitia only** (pas de scrape G&C)
- Secrets : ne jamais coller token / Basic auth dans canvas ou chat logs
- Fuseau : datetimes `YYYYMMDDThhmmss` = mur **Europe/Paris**

## Workflow

### 1. Collecter

Priorité des sources :

1. Payload collé par l’utilisateur
2. Logs Admin Debug / `ingest-api-logs` (lignes `train=` `base=` `real=`)
3. Code de vérité : `isNavitiaDepartureCancelled`, `parseNavitiaLocalDateTime`, filtre destination / fenêtre (`apps/api/src/adapters/departures-navitia.ts`, `matching.ts`)

Si données insuffisantes : demander un extrait JSON (1–3 départs + `disruptions[]`) plutôt qu’inventer.

### 2. Normaliser chaque départ

Pour chaque item `departures[]` (ou équivalent stop_schedules) :

| Champ dérivé | Source Navitia |
|---|---|
| train | `display_informations.trip_short_name` / `headsign` / `number` |
| theo | `stop_date_time.base_departure_date_time` → HH:mm Paris |
| real | `stop_date_time.departure_date_time` → HH:mm Paris |
| delayMin | diff real − theo (minutes) ; null si inconnu |
| depStatus | `stop_date_time.departure_status` |
| cancel | appliquer les règles ci-dessous |
| direction | `display_informations.direction` ou `route.direction.name` |
| disruptionIds | `links[]` type `disruption` |

### 3. Règles cancel (alignées ingest)

Un départ est **cancelled** si l’un de :

- `departure_status` ∈ `deleted` | `skipped` | `no_service`
- `additional_informations` / texte direction contient supprim / cancel / annul
- `base` présent et `real` absent
- disruption liée avec `severity.effect` ∈ `NO_SERVICE` | `DELETED_DEPARTURE`, ou texte cancel
- impacted stop sur la **gare surveillée** avec effect deleted (voir `reference.md`)

Sinon : `on_time` (delay ≤ 0), `delayed` (delay > 0), `unknown`.

### 4. Expliquer les écarts G&C

Causes fréquentes (ne pas inventer d’autre) :

1. **Sens** — filtre destination / corridor (ex. Menton depuis Monaco→Nice)
2. **Fenêtre** — hors `time_window` / veille
3. **Signal Navitia manquant** — G&C affiche « Train supprimé » mais JSON sans status/disruption
4. **TZ** — parse local sans Paris → décalage +1/+2 h

### 5. Canvas (obligatoire si ≥ 3 trains ou comparaison)

Chemin : `/Users/youssef/.cursor/projects/Users-youssef-SNCF-Alerts/canvases/<sujet>.canvas.tsx`

- Import **uniquement** `cursor/canvas` ; données **inline** ; pas de `fetch`
- Sections utiles (omettre si vides) :
  - Résumé (counts : on_time / delayed / cancelled / unknown / unmatched)
  - Table départs (train, théo, réel, retard, status app, status Navitia brut)
  - Table disruptions liées (id, effect, message)
  - Findings (3–7 bullets factuels)
- Caption : source + horodatage si connu
- Design : tokens thème, pas de gradients / emojis / hex hardcodés

Chat : 2–4 phrases + lien implicite au canvas ; pas de gros dump JSON.

## Hors scope

- Réécrire l’ingest sans demande explicite
- Scraper G&C
- Afficher secrets

## Référence

Détails champs / exemples → [reference.md](reference.md)
