# Proposal: Adopt React for `apps/web`

## Why

Le client vanilla (HTML string dans `main.ts`) limite l’évolution UI : header, dashboard soigné, admin, états et composants réutilisables. React + Vite reste compatible avec l’architecture `/v1` et permet une UI évolutive dans le temps.

## What Changes

- Stack web : **Vite + React + TypeScript** (remplace « UI simple » vanilla)
- Routing hash conservé (`#/`, `#/notifications`, `#/admin`)
- Header ops avec icônes (Lucide) + polish dashboard
- Pas de changement de contrats API `/v1` ni de périmètre produit

## Impact

- **MODIFIED** : stack technique web (baseline + system)
- **ADDED** : exigence stack React pour `apps/web`
- Hors scope : redesign admin complet, charts libs, dark mode obligatoire

## Approach

1. Delta OpenSpec + baseline
2. Scaffold React (plugin Vite, HashRouter, Lucide)
3. Migrer Dashboard / Notifications / Admin
4. Nouveau header + polish dashboard
5. Mettre à jour règles Cursor `web-client` / `dashboard`
