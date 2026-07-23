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
- **PostgreSQL 16** (Docker Compose fourni)
- Accès réseau restreint (VPN/firewall) pour le dashboard (pas d’auth app viewer en v1)
- Compte admin pour la console

## PostgreSQL

### Option A — Docker Compose (recommandé)

```bash
docker compose up -d db
```

Cela démarre Postgres avec :

| Paramètre | Valeur |
|-----------|--------|
| Host | `127.0.0.1` |
| Port | `5432` |
| User | `sncf` |
| Password | `sncf` |
| Database | `sncf_alerts` |
| URL | `postgres://sncf:sncf@127.0.0.1:5432/sncf_alerts` |

### Option B — Postgres local

Créer un rôle et une base, puis coller l’URL dans `.env` :

```bash
createuser sncf
createdb -O sncf sncf_alerts
# définir un mot de passe pour sncf, puis :
# DATABASE_URL=postgres://sncf:MOT_DE_PASSE@127.0.0.1:5432/sncf_alerts
```

L’API exécute automatiquement le schéma (`apps/api/src/db/schema.sql`) au démarrage et crée le compte admin (hash bcrypt) à partir de `ADMIN_USERNAME` / `ADMIN_PASSWORD`.

Pour **re-synchroniser** le mot de passe admin depuis `.env` vers la DB :

```env
ADMIN_PASSWORD_SYNC=true
```

Puis redémarrer l’API une fois, et remettre `false`.

## Mise à jour sur serveur

Sur le serveur, `npm install` / `npm audit` peut modifier `package.json` et `package-lock.json`. Un `git pull` échoue alors.

**Réparation immédiate (maintenant) :**

```bash
git fetch origin
git reset --hard origin/main
npm install
```

> Cela écrase les fichiers trackés locaux. Le `.env` (non versionné) est conservé.

**Ensuite (après pull de ce script) :**

```bash
./scripts/update.sh
```

Node.js **≥ 20** est supporté (ex. v20.19 sur Debian).

## Démarrage rapide

```bash
cp .env.example .env
# Éditer .env : ADMIN_PASSWORD, DATABASE_URL, COOKIE_SECURE=true si HTTPS

docker compose up -d db
npm install
npm run dev:api   # http://127.0.0.1:3001  (requiert DATABASE_URL)
npm run dev:web   # https://0.0.0.0:443  (proxy /v1 → API)
```

- Dashboard : `https://127.0.0.1:443/#/`
- Notifications : `https://127.0.0.1:443/#/notifications`
- Admin : `https://127.0.0.1:443/#/admin`

> Port 443 = HTTPS. Le certificat Vite est auto-signé : le navigateur affichera un avertissement à accepter une fois (dev uniquement). Sur macOS, le bind 443 peut nécessiter `sudo`.
> Avec HTTPS, garder `COOKIE_SECURE=true` pour la session admin (cookie httpOnly).
- Health : `http://127.0.0.1:3001/v1/health`

## Sécurité (règles de base)

- Ne **jamais** committer `.env`, tokens, mots de passe, webhooks
- Ne pas logger `Authorization`, `SMTP_PASSWORD`, `TEAMS_WEBHOOK_URL`, clés API
- L’API admin masque les secrets (`passwordConfigured` / `webhookConfigured`)
- Mot de passe admin stocké **hashé** (bcrypt) en base ; session cookie **httpOnly**
- Rate-limit sur `/v1/admin/login`
- Changer `ADMIN_PASSWORD` et `SESSION_SECRET` avant tout déploiement
- Logs : cookies / passwords / webhooks redactés

## Modèle de surveillance (Aller / Retour)

Chaque sens = **1 gare surveillée** (comme l’écran départs) + **filtre destination** :

| Sens | Gare | Filtre | Fenêtre défaut | Actif |
|------|------|--------|----------------|-------|
| Aller | Nice-Ville (`stop_area:SNCF:87756056`) | vers Monaco | 07:00–09:30 lun–ven | oui |
| Retour | Monaco – Monte-Carlo (`stop_area:SNCF:87756403`) | vers Nice | 16:00–19:00 lun–ven | oui |

- Poll toutes les **5 min** (`INGEST_INTERVAL_MS=300000`)
- Appels Navitia **uniquement** si le sens est `active` **et** dans sa fenêtre
- Toggle **Actif** dans l’admin pour couper un sens

## Obtenir les clés API (ingest)

Une seule source active via `INGEST_PROVIDER=stub|prim|navitia`.

### Stub (développement)

Aucune clé. Idéal pour développer dashboard, admin et notifiers.

```env
INGEST_PROVIDER=stub
INGEST_INTERVAL_MS=300000
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
INGEST_INTERVAL_MS=300000
```

L’adapter interroge les **départs** de la gare surveillée (`/stop_areas/.../departures`), filtre le sens (ex. Monaco / Nice), et crée une alerte si retard ≥ seuil ou suppression.

> PRIM reste optionnel pour d’autres réseaux. Ne pas lancer `npm audit fix --force` (casse le lockfile).

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
