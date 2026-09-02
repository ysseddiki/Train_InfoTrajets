# SNCF-Alerts

Outil **ops interne** : une ou plusieurs **liaisons** SNCF (chaque liaison = Aller + Retour), dashboard ops room, console admin, notifications **Email (SMTP)** et **Teams**.

> Specs : `openspec/specs/` · Baseline : `specs/system/baseline-v1.md` · **Reprise de dev (agent / nouvelle machine) : [`AGENTS.md`](AGENTS.md)**

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
- Accès réseau restreint (VPN/firewall) recommandé pour le dashboard
- Compte admin pour la console

**Reprise sur une autre machine** : tout est dans le dépôt (code, règles `.cursor/rules/`, skill `.cursor/skills/`, specs OpenSpec). Après clone : `cp .env.example .env`, renseigner `ADMIN_PASSWORD` + `DATABASE_URL` (+ `SECRETS_ENCRYPTION_KEY` recommandé), `docker compose up -d db`, `npm install`, `npm run dev:api` + `npm run dev:web`. Détail complet : [`AGENTS.md`](AGENTS.md).

## Déploiement prod — Docker Compose (recommandé)

Quatre conteneurs : **db**, **api**, **ingest**, **web** (nginx + build statique). Seul
`web` expose les ports 80/443 — l’API n’est pas joignable depuis l’extérieur.

**Prérequis serveur** : Docker Engine + Docker Compose v2.

```bash
git clone git@github.com:ysseddiki/Train_InfoTrajets.git
cd Train_InfoTrajets
cp .env.example .env
# Éditer : ADMIN_PASSWORD (fort), POSTGRES_PASSWORD, SERVER_NAME, SECRETS_ENCRYPTION_KEY

./scripts/deploy-docker.sh
```

TLS Let's Encrypt (DNS pointé, ports 80/443 ouverts) :

```bash
./scripts/init-letsencrypt-docker.sh ops.exemple.fr admin@exemple.fr
```

Mise à jour :

```bash
git pull
./scripts/deploy-docker.sh   # rebuild + redémarre les conteneurs
```

Renouvellement certificat (cron quotidien recommandé) :

```bash
docker compose -f docker-compose.prod.yml --profile certbot run --rm certbot renew
docker compose -f docker-compose.prod.yml exec web nginx -s reload
```

Vérifications :

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml exec api curl -fsS http://127.0.0.1:3001/v1/health
curl -k -I https://ops.exemple.fr/
```

`COOKIE_SECURE=true` dans `.env`. Les variables `DATABASE_URL`, `TRUSTED_PROXIES` et
`API_HOST` sont surchargées par `docker-compose.prod.yml` pour le réseau interne.

### Migration depuis systemd

1. Dumper la base existante : `pg_dump … > backup.sql`
2. Arrêter les services : `sudo systemctl disable --now sncf-alerts-api sncf-alerts-ingest nginx`
3. Lancer `./scripts/deploy-docker.sh`
4. Restaurer : `docker compose -f docker-compose.prod.yml exec -T db psql -U sncf sncf_alerts < backup.sql`

<details>
<summary>Déploiement bare-metal (systemd + nginx hôte) — legacy</summary>

Deux unités systemd : **api** et **ingest**. L’UI est un build statique servi par nginx
sur l’hôte (`apps/web/dist`). Voir `deploy/systemd/` et `deploy/nginx/sncf-alerts.conf`.

```bash
sudo cp deploy/systemd/sncf-alerts-{api,ingest}.service /etc/systemd/system/
./scripts/update.sh
sudo systemctl restart sncf-alerts-api sncf-alerts-ingest
sudo systemctl reload nginx
```

</details>

### Dev local (tout-en-un)

`INGEST_IN_PROCESS=true` (défaut) + `npm run dev:api` + `npm run dev:web`.

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

> `npm run dev:web` sert le **serveur de développement Vite** : réservé au poste local.
> En production, c’est un build statique derrière nginx (voir section Déploiement prod).
> Port 443 = HTTPS avec certificat auto-signé en dev (avertissement navigateur).
> Avec HTTPS, garder `COOKIE_SECURE=true` pour la session admin (cookie httpOnly).
- Health : `http://127.0.0.1:3001/v1/health`

## Sécurité (règles de base)

- Ne **jamais** committer `.env`, tokens, mots de passe, webhooks
- Ne pas logger `Authorization`, `SMTP_PASSWORD`, `TEAMS_WEBHOOK_URL`, clés API
- L’API admin masque les secrets (`passwordConfigured` / `webhookConfigured` / `tokenPreview` 5 caractères)
- Mot de passe admin stocké **hashé** (bcrypt) en base ; session cookie **httpOnly**
- Secrets opérationnels en base (SMTP password, token Navitia) **chiffrés AES-256-GCM** quand `SECRETS_ENCRYPTION_KEY` est défini (`openssl rand -base64 32`) — recommandé en prod
- Changement du mot de passe : Admin → Compte (`PUT /v1/admin/account/password`)
- Rate-limit sur `/v1/admin/login` par **IP réelle** et par **identifiant**, avec backoff ; plafond de lecture par IP sur `/v1/*`
- `TRUSTED_PROXIES` (défaut `loopback`) : sans allowlist, `X-Forwarded-For` serait ignoré et toutes les requêtes derrière nginx partageraient un compteur
- API en écoute locale (`API_HOST=127.0.0.1`) : le reverse-proxy n’est pas contournable
- CORS : allowlist `CORS_ORIGINS` (vide = aucune origine navigateur cross-origin ; l’UI passe par le proxy same-origin)
- Headers de sécurité + `no-store` sur `/v1/admin/*` ; CSP sur le vhost nginx (`deploy/nginx/sncf-alerts.conf`) **sans** `script-src 'unsafe-inline'`
- UI de production = build statique (pas de serveur de dev, pas de HMR, pas de sourcemap)
- Dépendances : `npm audit --audit-level=high` doit être au vert avant tout commit
- En production (`NODE_ENV=production`, défini par les unités systemd), l’API **refuse de démarrer** si `ADMIN_PASSWORD` vaut `changeme`
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
| `openspec/changes/*` | Deltas archivés (historique des décisions, ex. `security-ux-hardening`) |
| `specs/system/baseline-v1.md` | Baseline narrative versionnée |
| `AGENTS.md` | Guide agent : setup, carte du code, règles, workflow OpenSpec |

Travailler par **deltas** (`ADDED` / `MODIFIED` / `REMOVED`) avant d’étendre le code.

## Cursor

Règles dans `.cursor/rules/` : une règle **globale** + règles par domaine (`api`, `web`, `admin`, `dashboard`, `notifications`, `ingest`, `openspec`). Skill projet : `.cursor/skills/navitia-json-canvas/` (analyse visuelle de JSON Navitia). Tout est commité : le dev est reprenable sur une autre machine après un simple clone (voir [`AGENTS.md`](AGENTS.md)).

## Features marquées (revert)

Certaines expérimentations sont encapsulées derrière un id stable `FEATURE:…` (commentaires `BEGIN` / `END` + module dédié).

| Feature id | Rôle |
|------------|------|
| `navitia-orphan-cancellations-from-impacted-objects` | Remonte les trains **supprimés** présents dans `disruptions.impacted_objects` / `impacted_stops` même s’ils ont disparu du listing `departures[]` (board + alertes). |

### Retirer une feature

Phrase exacte à donner à l’agent (ou à chercher dans le dépôt) :

```text
Revert FEATURE:navitia-orphan-cancellations-from-impacted-objects
```

Effet attendu : supprimer `apps/api/src/adapters/navitia-orphan-cancellations.ts` (+ son test) et tous les blocs `BEGIN FEATURE:…` / `END FEATURE:…` / imports associés dans `ingest.ts` (et mentions OpenSpec / README de cette feature).
