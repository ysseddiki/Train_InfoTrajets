# Référence Navitia (SNCF-Alerts)

## Endpoints utilisés par l’app

- Départs gare : `…/stop_areas/{id}/departures?from_datetime=…&duration=…&count=…&data_freshness=realtime`
- Enrichissement OD : `…/vehicle_journeys/{id}` (ordre des `stop_area`)

Datetimes request/response : `YYYYMMDDThhmmss` (Europe/Paris mur).

## Forme minimale d’un départ

```json
{
  "display_informations": {
    "direction": "Grasse",
    "headsign": "86056",
    "trip_short_name": "86056"
  },
  "stop_date_time": {
    "base_departure_date_time": "20260825T164700",
    "departure_date_time": "20260825T174700",
    "departure_status": "delayed",
    "additional_informations": []
  },
  "links": [{ "type": "disruption", "id": "…" }, { "type": "vehicle_journey", "id": "…" }],
  "route": { "direction": { "name": "Grasse", "id": "…" } }
}
```

## Disruption

```json
{
  "id": "…",
  "severity": { "effect": "NO_SERVICE", "name": "trip canceled" },
  "messages": [{ "text": "Train supprimé" }],
  "impacted_objects": [
    {
      "pt_object": { "embedded_type": "trip", "id": "…" },
      "impacted_stops": [
        {
          "stop_point": { "stop_area": { "id": "stop_area:SNCF:…" } },
          "departure_status": "deleted",
          "stop_time_effect": "deleted"
        }
      ]
    }
  ]
}
```

Effects cancel côté app : `NO_SERVICE`, `DELETED_DEPARTURE`.  
Delay typique : `SIGNIFICANT_DELAYS` → **pas** cancel.

## Code source

| Sujet | Fichier |
|---|---|
| Parse Paris | `parseNavitiaLocalDateTime` — `apps/api/src/adapters/departures-navitia.ts` |
| Cancel | `isNavitiaDepartureCancelled` — même fichier |
| Filtre OD / corridor | `matchesDestinationFilter*` — `apps/api/src/domain/matching.ts` |
| Fenêtre veille | `isWatchedDeparture` — `matching.ts` |
| Board prochain | `saveNextFromNavitia` — `apps/api/src/adapters/ingest.ts` |
| Debug observations | `GET /v1/admin/debug/train-observations` |

## Checklist debug rapide

1. Le train est-il dans `departures[]` Navitia ?
2. Direction / VJ matche-t-il la liaison ?
3. Théorique dans `time_window` ?
4. Signaux cancel présents (status / disruption / impacted stop gare) ?
5. Affichage HH:mm Paris cohérent avec `base_departure_date_time` ?
