# Design: Ops Platform v1

## Context

Outil interne pour surveiller deux sens de trajet SNCF (Aller / Retour), afficher l’état sur un dashboard, configurer cibles et canaux dans une console admin, et notifier via SMTP custom + Microsoft Teams.

## Goals

- Séparation stricte client (`apps/web`) / serveur (`apps/api`)
- Dashboard lecture seule (pas d’auth applicative ; protection réseau)
- Admin : session login simple (mot de passe hashé serveur)
- Ingest stub en dev ; une source réelle (PRIM ou Navitia) en prod
- Secrets via env / secret manager ; jamais dans git ni réponses API en clair

## Non-Goals (v1)

- Comptes viewer / inscription voyageurs
- SSO / OIDC / 2FA
- Push, SMS
- Plus de deux trajets (Aller + Retour uniquement)
- UI dashboard “pixel-perfect”

## Architecture

```text
┌─────────────────┐     HTTPS      ┌──────────────────┐
│  apps/web       │───────────────▶│  apps/api        │
│  Dashboard      │   /v1/*        │  REST + workers  │
│  Admin console  │◀───────────────│                  │
└─────────────────┘                └────────┬─────────┘
                                            │
                     ┌──────────────────────┼──────────────────────┐
                     ▼                      ▼                      ▼
               PostgreSQL                 Redis              SMTP / Teams
                     ▲
                     │
              Ingest adapter (stub | PRIM | Navitia)
```

### Packages

| Path | Role |
|------|------|
| `apps/web` | UI only — appelle l’API, aucun secret métier |
| `apps/api` | Auth admin, CRUD config, ingest, matching, notify |
| `packages/shared` | Types / schémas partagés (sans secrets) |

### Auth

- `POST /v1/admin/login` → cookie de session httpOnly (ou token opaque serveur)
- Mot de passe admin : hash argon2/bcrypt ; bootstrap via env `ADMIN_PASSWORD` au premier démarrage ou seed
- Routes `/v1/admin/*` protégées
- Routes dashboard `/v1/dashboard/*` ou `/v1/stats`, `/v1/journeys`, `/v1/events` **sans** auth app (réseau trusté)

### Secrets handling

- SMTP password, Teams webhook, clés PRIM/Navitia : variables d’environnement
- En DB : au plus des `secret_ref` ou valeurs chiffrées ; API renvoie `configured: true` / masque `****`
- `.env` gitignored ; `.env.example` versionné avec placeholders

### Notification flow

1. Ingest normalise un `DisruptionEvent`
2. Matching rattache à `outbound` (Aller) ou `inbound` (Retour) selon ressource + fenêtre
3. Pour chaque canal actif (email, teams) : créer `AlertDelivery`, envoyer, enregistrer statut
4. Échec d’un canal n’bloque pas l’autre

### Client/server contract

- Le web ne parle **jamais** à PRIM, SMTP ou Teams
- Sans API : le web affiche un état d’erreur (pas de données fictives en prod)

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Dashboard sans auth app | Exiger VPN / firewall (documenté README) |
| Login simple | Compte admin unique v1 ; hash fort ; rate-limit login |
| Une seule source ingest | Adapter pattern pour ajouter une 2e source plus tard |
| Webhook Teams en config | Write-only / masked after save |

## Open Questions (resolved)

- Viewer accounts → **non en v1**
- Dashboard auth → **option B** (réseau only)
- Destinataires → **saisis par l’admin dans l’UI**
