# Design: Multi-liaisons

## Model

```text
Liaison 1──2 JourneyConfig (outbound, inbound)
         └──* DisruptionEvent (journey_id, liaison_id)
```

Display name = `name.trim()` or `originLabel <-> destinationLabel` (from outbound).

## Migration

1. Create `liaisons`
2. If `journeys` lacks `liaison_id`, rebuild table and attach legacy rows to one liaison
3. Add `journey_id` / `liaison_id` on `disruption_events`
