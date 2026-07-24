# Design: Adopt React web

## Goals

- UI composable et maintenable (Dashboard, Notifications, Admin)
- Même UX fonctionnelle qu’avant (cookie admin, endpoints `/v1`)
- Direction visuelle ops claire : header icônes, statut A/R dominant, stats secondaires

## Non-goals

- Réécrire l’API
- Introduire un design system externe lourd
- Browser history (`BrowserRouter`) — on garde le hash pour ne pas casser les liens

## Architecture

```text
apps/web (Vite + React)
  components/   Layout (header), JourneyCard, tables, stats
  pages/        Dashboard, Notifications, Admin
  api/client    fetch credentials:include → /v1
  styles/       tokens CSS évolutifs
packages/shared types + formatDelayMinutes
```

## Décisions

| Sujet | Choix |
|-------|--------|
| Framework | React 19 |
| Router | `react-router-dom` `HashRouter` |
| Icons | `lucide-react` |
| CSS | fichier unique évolutif (pas Tailwind v1) |
| Auth | inchangé (cookie httpOnly) |

## Risques

- Migration admin forms → régression mapping PUT : tests manuels login / journeys / tests canaux
- Port 443 HTTPS Vite inchangé
