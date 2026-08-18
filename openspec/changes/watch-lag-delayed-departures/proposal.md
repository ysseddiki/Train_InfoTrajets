# Proposal: Trains théoriques passés encore en gare

## Why

La veille s’arrête à `time_window.end`. Un train dont l’heure **théorique** est passée mais qui n’est pas parti (retard qui grandit) sort du radar : plus de poll, plus de board, plus de notif.

## What Changes

- Fenêtre de veille : `[start − lead, end + 2 h]` (lag fixe 2 h, TZ Paris)
- Pendant le lag : seulement les trains dont l’heure **théorique** est dans la fenêtre trajet
- Navitia : `from_datetime` en lookback + filtre « encore dû » (heure réelle, pas la base)
- Board : ne pas afficher un départ déjà échu en temps réel

## Impact

- **MODIFIED** : ingest, matching, dashboard
