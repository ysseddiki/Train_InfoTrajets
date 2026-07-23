# SNCF-Alerts

Outil **ops interne** : surveillance de deux trajets SNCF (**Aller** / **Retour**), dashboard de lecture, console admin, notifications **Email (SMTP)** et **Microsoft Teams**.

> Specs : `openspec/specs/` · Baseline : `specs/system/baseline-v1.md` · Change en cours : `openspec/changes/refine-ops-platform-v1/`

## Architecture

```text
apps/web       → Client (Dashboard + Admin) — aucun secret métier
apps/api       → Serveur REST + adapters ingest/notify
packages/shared → Types partagés
```

Le client **ne fonctionne pas sans l’API**. Les clés PRIM/Navitia, SMTP et Teams restent **uniquement côté serveur**.

## Prérequis

- Node.js **≥ 22**
- Accès réseau restreint (VPN/firewall) pour le dashboard (pas d’auth app viewer en v1)
- Compte admin pour la console

## Démarrage rapide

```bash
cp .env.example .env
# Éditer .env : ADMIN_PASSWORD, etc.

npm install
npm run dev:api   # http://127.0.0.1:3001
npm run dev:web   # http://0.0.0.0:443  (proxy /v1 → API)
```

- Dashboard : `http://127.0.0.1:443/#/`
- Admin : `http://127.0.0.1:443/#/admin`
- Health : `http://127.0.0.1:3001/v1/health`

## Sécurité (règles de base)

- Ne **jamais** committer `.env`, tokens, mots de passe, webhooks
- Ne pas logger `Authorization`, `SMTP_PASSWORD`, `TEAMS_WEBHOOK_URL`, clés API
- L’API admin masque les secrets (`passwordConfigured` / `webhookConfigured`)
- Changer `ADMIN_PASSWORD` et `SESSION_SECRET` avant tout déploiement

## Obtenir les clés API (ingest)

Une seule source active via `INGEST_PROVIDER=stub|prim|navitia`.

### Stub (développement)

Aucune clé. Idéal pour développer dashboard, admin et notifiers.

```env
INGEST_PROVIDER=stub
```

### PRIM — Île-de-France Mobilités (temps réel)

Utile si vos trajets Aller/Retour sont en Île-de-France (Transilien, RER, etc.).

1. Créer un compte sur le portail [Île-de-France Mobilités — PRIM](https://prim.iledefrance-mobilites.fr/)
2. Créer une application et générer une **clé API**
3. Consulter la doc des APIs temps réel / perturbations sur le portail
4. Renseigner dans `.env` :

```env
INGEST_PROVIDER=prim
PRIM_API_KEY=votre_cle
```

Respecter les quotas et conditions d’usage du portail.

### Navitia / open data SNCF

Utile pour référentiel gares/lignes et perturbations hors ou en complément PRIM.

1. Documentation et accès : [Navitia](https://www.navitia.io/) et/ou [Open Data SNCF](https://data.sncf.com/)
2. Créer un compte / token selon le fournisseur choisi
3. Renseigner :

```env
INGEST_PROVIDER=navitia
NAVITIA_TOKEN=votre_token
```

> Les adapters PRIM/Navitia sont **prévus** (ports dans `apps/api/src/adapters`) ; le squelette actuel tourne en `stub`. Brancher le provider réel est une tâche suivante (voir `openspec/changes/refine-ops-platform-v1/tasks.md`).

## Email (SMTP custom)

```env
EMAIL_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USERNAME=...
SMTP_PASSWORD=...
SMTP_FROM=alerts@example.com
```

Les **destinataires** se configurent ensuite dans la console admin (liste d’emails), pas dans git.

## Microsoft Teams

1. Dans Teams : canal → Connecteurs → **Incoming Webhook** (ou Workflows équivalent)
2. Copier l’URL du webhook dans `.env` :

```env
TEAMS_ENABLED=true
TEAMS_WEBHOOK_URL=https://...
```

Ne jamais coller cette URL dans le dépôt git.

## OpenSpec

| Chemin | Rôle |
|--------|------|
| `openspec/specs/*` | Source de vérité par domaine |
| `openspec/changes/refine-ops-platform-v1/` | Pivot ops en cours |
| `specs/system/baseline-v1.md` | Baseline narrative v1.1 |

Travailler par **deltas** (`ADDED` / `MODIFIED` / `REMOVED`) avant d’étendre le code.

## Cursor

Règles dans `.cursor/rules/` : une règle **globale** + règles par domaine (`api`, `web`, `admin`, `dashboard`, `notifications`, `ingest`, `openspec`).
