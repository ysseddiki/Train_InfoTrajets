# SNCF-Alerts — Guide agent / reprise de dev

Point d’entrée unique pour reprendre le développement de ce dépôt avec Cursor (ou un autre agent), **y compris sur une nouvelle machine**.

---

## 1. Setup post-clone (checklist)

```bash
git clone git@github.com:ysseddiki/Train_InfoTrajets.git SNCF-Alerts
cd SNCF-Alerts

cp .env.example .env
# Éditer .env :
#   - ADMIN_PASSWORD (fort — refusé en prod si "changeme")
#   - DATABASE_URL si Postgres n’est pas le Docker local
#   - SECRETS_ENCRYPTION_KEY : openssl rand -base64 32   (recommandé, chiffre SMTP/Navitia en base)
#   - CORS_ORIGINS : vide en dev same-origin (Vite proxy /v1)

docker compose up -d db          # Postgres 16 local (127.0.0.1:5432, sncf/sncf)
npm install
npm run dev:api                  # API http://127.0.0.1:3001 (migre le schéma + seed admin au 1er boot)
npm run dev:web                  # UI https://0.0.0.0:443 (cert auto-signé en dev, proxy /v1 → API)
```

- UI : `https://127.0.0.1:443/#/` — login `admin` / `ADMIN_PASSWORD` (ou « Continuer en visiteur »)
- Health : `http://127.0.0.1:3001/v1/health`
- Sans token Navitia : provider `stub` + **Admin → Debug** pour injecter des événements
- Token Navitia : **Admin → Ingest** (DB chiffrée), jamais dans `.env`

**Prérequis machine** : Node.js ≥ 20, Docker (ou Postgres local), rien d’autre. Aucune config Cursor spécifique n’est requise : les règles (`.cursor/rules/`) et le skill (`.cursor/skills/`) sont **commités** dans le dépôt.

## 2. Commandes quotidiennes

| Commande | Rôle |
|----------|------|
| `npm run dev:api` | API Fastify (watch) |
| `npm run dev:web` | UI Vite — **dev uniquement** (HTTPS auto-signé + proxy `/v1`) |
| `npm run dev:ingest` | Worker ingest séparé (si `INGEST_IN_PROCESS=false`) |
| `npm run typecheck` | `tsc --noEmit` sur les 3 workspaces — **à faire passer avant tout commit** |
| `npm run test` | Tests API |
| `npm audit --audit-level=high` | **À faire passer avant tout commit** |
| `npm run build` | Build workspaces — produit `apps/web/dist`, servi par nginx en prod |

## 3. Carte du code

```text
apps/api            Fastify : routes /v1, métier, ingest, notifiers, secrets
  src/index.ts        bootstrap (CORS allowlist, admin guard, routes, boucle ingest)
  src/domain/         store.ts (Postgres), auth.ts, secrets.ts (AES-GCM), matching…
  src/routes/         auth.ts, dashboard.ts, admin.ts
  src/adapters/       departures-navitia.ts, ingest.ts
apps/web            Vite + React 19 : UI only, appelle /v1 via src/api/client.ts (cookie session)
  src/pages/          DashboardPage, NotificationsPage, TrainStatusPage (admin), AdminPage
  src/components/     panels (DelayReasonsPanel, WeatherCorrelationPanel, ActivityHeatmap…)
  src/auth/           AuthContext (fail-closed visiteur)
  src/theme/          thème clair/sombre (défaut clair, localStorage sncf.theme)
packages/shared     Types partagés — AUCUN secret, aucune valeur sensible
openspec/specs/     Source de vérité par domaine (auth, dashboard, admin, ingest, notifications, system)
openspec/changes/   Deltas archivés (un dossier par évolution structurante)
specs/system/       Baseline narrative versionnée (baseline-v1.md)
deploy/             systemd units (api, ingest) + vhost nginx (statique, CSP, HSTS, limit_req)
scripts/            update.sh (pull + build serveur), setup-letsencrypt.sh
```

**Prod** : deux services seulement (`api`, `ingest`). L’UI est un **build statique**
(`apps/web/dist`) servi par nginx — pas de serveur Vite, pas de HMR, pas de sourcemap.

## 4. Règles non négociables

1. **Pas de secret côté client** : Navitia, SMTP password, webhook Teams restent dans `apps/api`. `packages/shared` ne transporte que des DTO publics (`passwordConfigured`, `tokenPreview` 5 car.).
2. **Secrets en base chiffrés** (AES-256-GCM) via `src/domain/secrets.ts` quand `SECRETS_ENCRYPTION_KEY` est défini — passer par `encryptSecret` / `decryptSecret`, jamais de clair nouveau dans `app_meta`.
3. **CORS** : ne jamais remettre `origin: true` avec credentials — compléter `CORS_ORIGINS`.
4. **RBAC côté API** : le filtrage UI n’est pas une barrière ; chaque route admin garde `requireRole`.
5. **SQL paramétré** partout (`$1`, `$2`…), fragments dynamiques issus d’allowlists.
6. **Logs** : ne pas logger tokens / passwords / webhooks / cookies (chemins déjà redactés dans Fastify).
7. **Ne pas réintroduire** : push, comptes voyageurs B2C, SSO, scrape Gares & Connexions, failover ZOU/PRIM — un changement de ce type exige d’abord un delta OpenSpec.
8. **Motifs / météo** : ne jamais inventer un motif de retard ou une condition météo absente de la source.
9. **UI** : thème clair par défaut ; accessibilité (clavier tabs/listbox/dialogs, `role="alert"`, focus visible) à conserver sur tout nouveau composant interactif.
10. **Pas de serveur de dev en production** : l’UI se déploie en build statique. Ne pas
    réintroduire de `<script>` inline ni de gestionnaire `onclick=` dans `index.html` —
    la CSP interdit `script-src 'unsafe-inline'` (amorçage thème = `public/theme-boot.js`).
11. **Rate limiting** : `trustProxy` doit rester aligné avec le reverse-proxy, sinon les
    compteurs par IP fusionnent. Toute nouvelle route déclenchant un appel externe sans
    session doit passer par un `OutboundBudget`.

## 5. Workflow OpenSpec

Avant d’étendre le périmètre :

1. Lire `openspec/specs/` (domaine concerné) + `specs/system/baseline-v1.md`
2. Changement structurant → créer `openspec/changes/<slug>/` (`proposal.md`, `tasks.md`, deltas `specs/<domaine>/spec.md` en `ADDED`/`MODIFIED`/`REMOVED`)
3. Après implémentation : reporter dans `openspec/specs/` et bumper le changelog de la baseline

Les dossiers existants dans `openspec/changes/` (ex. `security-ux-hardening`, `on-time-board-heatmap`) servent d’historique de décisions — les lire pour comprendre le « pourquoi ».

## 6. Règles et skill Cursor commités

- `.cursor/rules/00-global.mdc` — règles produit/archi/sécu (toujours appliquées)
- `.cursor/rules/{admin-console,api-server,dashboard,ingest,notifications,openspec,web-client}.mdc` — par domaine
- `.cursor/skills/navitia-json-canvas/` — analyse visuelle de réponses JSON Navitia (départs / disruptions / suppressions) pour déboguer l’ingest

## 7. Features revertibles

Certaines expérimentations sont balisées `BEGIN/END FEATURE:<id>`. Pour les retirer : `Revert FEATURE:<id>` (voir README § Features marquées). Actuellement : `navitia-orphan-cancellations-from-impacted-objects`.

## 8. Dépannage express

| Symptôme | Piste |
|----------|-------|
| API refuse de démarrer (prod) | `ADMIN_PASSWORD` encore `changeme` → mettre un mot de passe fort |
| Log « NODE_ENV n’est pas production » | unité systemd sans `Environment=NODE_ENV=production` → gardes de prod inactives |
| UI 401 sur `/v1/*` en dev | API pas démarrée ou proxy Vite — vérifier `dev:api` sur :3001 |
| UI prod figée sur l’ancienne version | build non régénéré → `npm run build -w @sncf-alerts/web` puis `systemctl reload nginx` |
| `429` inattendu sur le login | rate-limit par IP **ou** par identifiant ; vérifier `TRUSTED_PROXIES` (sinon compteur partagé) |
| API injoignable depuis l’extérieur | attendu : `API_HOST=127.0.0.1`, tout passe par nginx |
| Secrets illisibles après ajout de `SECRETS_ENCRYPTION_KEY` | les anciennes valeurs en clair restent lisibles (fallback) ; les ré-enregistrer via Admin pour les chiffrer |
| Requêtes navigateur bloquées CORS | ajouter l’origine à `CORS_ORIGINS` ou passer par le proxy same-origin |
| `git pull` KO sur serveur | `package*.json` modifiés localement → voir README « Mise à jour sur serveur » |
