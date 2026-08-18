# Delta for Dashboard

## ADDED Requirements

### Requirement: Stats motifs de retard

Les agrégats période (`last24h` / `7d` / `30d`) SHALL inclure un décompte des retards **par `delay_reason_key`** (top motifs) et le nombre de retards **sans motif**. Un motif manquant MUST NOT être affiché comme une cause inventée.

#### Scenario: Mix motifs

- **GIVEN** 3 retards « travaux », 1 sans motif, sur 24 h
- **WHEN** le dashboard charge
- **THEN** les stats 24 h listent travaux (3) et un compteur sans motif (1)
