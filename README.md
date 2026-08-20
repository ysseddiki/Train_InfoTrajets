# SNCF-Alerts

Outil **ops interne** : une ou plusieurs **liaisons** SNCF (chaque liaison = Aller + Retour), dashboard ops room, console admin, notifications **Email (SMTP)** et **Teams**.

> Specs : `openspec/specs/` · Baseline : `specs/system/baseline-v1.md` · Change : `openspec/changes/ops-smtp-drop-prim/`

## Architecture

```text
apps/web       → Client React (Dashboard ops room + Admin) — aucun secret
apps/api       → HTTP /v1 (optionnel : poll ingest dans le même process)
worker-ingest  → Poll Navitia/stub + file notify_jobs (systemd séparé recommandé)
packages/shared → Types partagés
```

Le client **ne fonctionne pas sans l’API**. Token Navitia = **Admin → Ingest** (DB), pas le `.env`.

## Prérequis

- Node.js **≥ 20**
- **PostgreSQL 16** (Docker Compose fourni)
- Accès réseau restreint (VPN/firewall) pour le dashboard (pas d’auth app viewer en v1)
- Compte admin pour la console

## Systemd (API ≠ ingest ≠ web) — recommandé en prod

Trois unités : **api** (HTTP `/v1`), **ingest** (poll), **web** (UI Vite + proxy `/v1` → api).

Sur le serveur (chemins / `User=` à adapter) :

```bash
sudo cp deploy/systemd/sncf-alerts-api.service /etc/systemd/system/
sudo cp deploy/systemd/sncf-alerts-ingest.service /etc/systemd/system/
sudo cp deploy/systemd/sncf-alerts-web.service /etc/systemd/system/
# Éditer User= et WorkingDirectory= si besoin
# Port 443 : si EACCES avec User=debian → User=root (comme souvent déjà pour api)
sudo systemctl daemon-reload
sudo systemctl enable --now sncf-alerts-api sncf-alerts-ingest sncf-alerts-web
sudo systemctl status sncf-alerts-api sncf-alerts-ingest sncf-alerts-web
```

Après `./scripts/update.sh` :

```bash
sudo systemctl restart sncf-alerts-api sncf-alerts-ingest sncf-alerts-web
```

Dans `.env` : `INGEST_IN_PROCESS=false` pour que l’API ne double pas le poll.

### HTTPS Let's Encrypt (prod)

Prérequis : un **nom de domaine** (DNS A/AAAA → IP du serveur), ports **80** et **443** ouverts.

**Recommandé — nginx termine TLS** (renouvellement automatique) :

```bash
sudo ./scripts/setup-letsencrypt.sh ops.exemple.fr admin@exemple.fr
# → WEB_BEHIND_PROXY=true, Vite sur 127.0.0.1:5173, nginx :80/:443
sudo certbot renew --dry-run
```

**Alternatif — Vite lit les certificats LE** (sans nginx) :

```bash
sudo ./scripts/setup-letsencrypt.sh ops.exemple.fr admin@exemple.fr --vite-direct
# → WEB_TLS_CERT / WEB_TLS_KEY dans .env, Vite sur :443
```

Garder `COOKIE_SECURE=true`. Conf nginx d’exemple : `deploy/nginx/sncf-alerts.conf`.

Dev local (tout-en-un) : laisser `INGEST_IN_PROCESS=true` (défaut) et `npm run dev:api` + `npm run dev:web`.

Sans token Navitia : `INGEST_PROVIDER=stub` + **Admin → Debug** (inject / historique) pour peupler le dashboard.

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

L’API exécute automatiquement le schéma (`apps/api/src/db/schema.sql`) au démarrage et crée le **premier** compte admin (hash bcrypt, rôle `admin`) à partir de `ADMIN_USERNAME` / `ADMIN_PASSWORD` **au premier boot**. Ensuite, les comptes se gèrent dans **Admin → Comptes**. Chaque user change son mot de passe via le menu compte (ou Admin → Compte).

Le dashboard est derrière une **porte d’entrée** (connexion ou visiteur). Un admin peut désactiver le mode visiteur dans **Admin → Accès**.

Pour **ré-écraser** le hash du compte bootstrap depuis `.env` (urgence / oubli) :

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

> Port 443 = HTTPS. **Dev** : certificat Vite auto-signé (avertissement navigateur). **Prod** : Let's Encrypt via `scripts/setup-letsencrypt.sh` (voir section Systemd).
> Avec HTTPS, garder `COOKIE_SECURE=true` pour la session admin (cookie httpOnly).
- Health : `http://127.0.0.1:3001/v1/health`

## Sécurité (règles de base)

- Ne **jamais** committer `.env`, tokens, mots de passe, webhooks
- Ne pas logger `Authorization`, `SMTP_PASSWORD`, `TEAMS_WEBHOOK_URL`, clés API
- L’API admin masque les secrets (`passwordConfigured` / `webhookConfigured` / `tokenPreview` 5 caractères)
- Mot de passe admin stocké **hashé** (bcrypt) en base ; session cookie **httpOnly**
- Changement du mot de passe : Admin → Compte (`PUT /v1/admin/account/password`)
- Rate-limit sur `/v1/admin/login`
- Changer `ADMIN_PASSWORD` (premier boot) et `SESSION_SECRET` avant tout déploiement
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

La source active (`stub` | `navitia` | `prim`) et le token se configurent dans **Admin → Ingest** (`GET/PUT /v1/admin/ingest`). Le secret est write-only : après saisie, seuls les **5 premiers caractères** sont renvoyés (`tokenPreview`).

`INGEST_PROVIDER` dans `.env` ne sert qu’au **bootstrap** du provider si la DB est vide. Les **tokens** se configurent uniquement dans **Admin → Ingest** (jamais dans git / `.env` courant).

### Stub (développement)

Choisir `stub` dans l’admin. Aucune clé. Idéal pour dashboard, admin et notifiers.

Intervalle de poll : configurable **par provider** dans Admin → Ingest (60–3600 s).  
Défaut / bootstrap : `INGEST_INTERVAL_MS` (env), sinon 300 s.

```env
INGEST_INTERVAL_MS=300000
```

### Navitia / API SNCF (`api.sncf.com`)

L’ingest `navitia` appelle **`https://api.sncf.com/v1`** (moteur Navitia SNCF : horaires / temps réel trains).

1. Demander un token développeur : [Formulaire clé API SNCF](https://numerique.sncf.com/startup/api/token-developpeur/)
2. FAQ auth : [numerique.sncf.com/faq/api](https://numerique.sncf.com/faq/api/) — Basic auth, username = token, password vide
3. Admin → Ingest : provider `navitia` + coller le token

Test hors app (token = celui collé en Admin, pas un `.env`) :

```bash
# remplace TOKEN par la valeur Admin → Ingest
curl -s -o /dev/null -w "%{http_code}\n" -u "TOKEN:" \
  "https://api.sncf.com/v1/coverage/sncf"
# attendu : 200
```

> **Pas** la clé du compte [data.sncf.com/account](https://data.sncf.com/account/) (portail jeux de données Open Data) — elle ne fonctionne pas sur `api.sncf.com` (401).

L’adapter interroge les **départs** de la gare surveillée (`/stop_areas/.../departures`), filtre le sens (ex. Monaco / Nice), et crée une alerte si retard ≥ seuil ou suppression.

> Ne pas lancer `npm audit fix --force` (casse le lockfile).

## Email (SMTP custom)

Configurer dans **Admin → Canaux → SMTP** (stocké en base, mot de passe write-only).  
Optionnel au premier boot : bootstrap depuis `.env` si la meta SMTP est vide.

```env
# Bootstrap optionnel (sinon Admin → Canaux)
EMAIL_ENABLED=true
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USERNAME=...
SMTP_PASSWORD=...
SMTP_FROM=alerts@example.com
```

Les **destinataires** se configurent dans la console admin (liste d’emails).

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
