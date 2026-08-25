## ADDED Requirements

### Requirement: Observations trains à l’heure

L’ingest Navitia MUST persister une observation idempotente pour chaque départ surveillé, y compris `on_time`, sans notification.

### Requirement: Statut board = prochain train

Le bandeau statut MUST suivre `nextDeparture`, pas le succès du dernier poll.

### Requirement: Heatmap pondérée

Le score heatmap MUST être dilué par `onTimeCount` ; jour observé sans retard → vert.
