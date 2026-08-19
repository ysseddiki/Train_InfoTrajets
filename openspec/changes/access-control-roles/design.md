# Design: Accès visiteur, comptes locaux, rôles

## Context

Aujourd’hui : dashboard sans auth app, un `admin_accounts`, cookie httpOnly, toute la console derrière `requireAdmin`.

## Goals

- Porte d’entrée avant le shell (login ou visiteur)
- Toggle visiteur (défaut ON pour ne pas lock-out les déploiements existants)
- Comptes locaux, un rôle par compte
- Autorisation serveur (401 / 403), UI filtrée en miroir
- Préparer OIDC sans l’implémenter

## Non-Goals

- OIDC / SSO
- Inscription publique
- Rôles combinables / RBAC granulaire
- Admin en lecture seule
- Reset mot de passe par e-mail

## AuthZ

| Surface | visiteur | `reader` | `liaison_editor` | `admin` |
|---------|----------|----------|------------------|---------|
| Dashboard / notifs | si flag ON | oui | oui | oui |
| CRUD liaisons | non | non | oui | oui |
| GET stations + POST depuis formulaire liaison | non | non | oui | oui |
| PUT/DELETE stations, ingest, canaux, debug, users, toggle visiteur | non | non | non | oui |

`admin_accounts` conserve le nom de table ; colonnes `role`, `disabled_at`. Flag `visitor_enabled` dans `app_meta`.

## API

- `GET /v1/auth/config` public `{ visitorEnabled }`
- Login inchangé `POST /v1/admin/login` ; `GET /v1/admin/me` → `{ username, role }`
- `GET/POST /v1/admin/users`, `PATCH /v1/admin/users/:id` (admin)
- `GET/PUT /v1/admin/settings/access` `{ visitorEnabled }` (admin)
- Dernier admin actif : pas de disable / rétrogradation

## UI

- `AuthContext` + page porte d’entrée hors sidebar
- Ack visiteur en `sessionStorage`
- Lien Admin si `liaison_editor` | `admin`
- Menu compte (logout, mot de passe) pour tout user connecté
