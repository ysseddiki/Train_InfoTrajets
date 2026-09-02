# Proposal: Posture de production — correctifs sécurité prioritaires (v1.16.0)

Premier volet de l'audit sécurité du 2026-09-02. Ce change corrige les six constats
exploitables : trois protections décrites dans les specs sont aujourd'hui inopérantes
en déploiement réel, et le client web est servi par un serveur de développement.

Le durcissement en profondeur (CSRF, secrets, validation serveur, confinement systemd,
journal d'audit) fait l'objet du change suivant `security-hardening-depth`.

## Why

- **Serveur de dev en production** : `sncf-alerts-web.service` exécute `npm run dev:web`
  (= `vite`). Sources et sourcemaps exposés, HMR ouvert, `allowedHosts` permissif dès que
  `WEB_BEHIND_PROXY=true`, et CSP contrainte à `'unsafe-inline'` sur `script-src`.
- **`NODE_ENV` jamais positionné** : la garde « refus de démarrer si
  `ADMIN_PASSWORD=changeme` » (spec `auth`) ne s'exécute dans aucune unité systemd.
  Un serveur peut tourner indéfiniment avec le mot de passe par défaut.
- **Rate-limit login inopérant** : `req.ip` sans `trustProxy` vaut `127.0.0.1` derrière
  nginx. Le seuil est global : aucun bridage par attaquant, un succès de connexion réarme
  le compteur partagé, et un seul attaquant verrouille tous les opérateurs.
- **API joignable hors proxy** : `API_HOST` par défaut à `0.0.0.0` — HSTS, CSP et limites
  du reverse-proxy sont contournables si le pare-feu n'est pas strictement fermé.
- **Dépendances vulnérables** : 6 avis, dont `nodemailer@6.10.1` (épinglé) avec injection
  de commandes SMTP et d'en-têtes par CRLF sur le chemin des notifications.
- **Amplification non authentifiée** : le mode visiteur (actif par défaut) donne accès à
  `/v1/dashboard/day`, qui déclenche un appel Open-Meteo par date distincte, sans aucune
  limitation de débit.

## What Changes

### Build et service du client

- **MODIFIED** : le client web est construit (`vite build`) et servi en statique par nginx.
- **REMOVED** : `sncf-alerts-web.service` (plus de processus Node pour l'UI en production).
- **MODIFIED** : CSP sans `'unsafe-inline'` sur `script-src` — l'amorçage du thème et la
  bascule des webfonts passent de `index.html` à `public/theme-boot.js`.
  `style-src` garde `'unsafe-inline'` en repli (largeurs dynamiques de `QuotaPanel`),
  encadré par `style-src-elem 'self'` et `style-src-attr 'unsafe-inline'`.
- **FIXED** : la CSP bloquait silencieusement Google Fonts (`style-src`/`font-src 'self'`)
  alors que `index.html` les charge ; les deux origines sont désormais explicites.
- **MODIFIED** : `scripts/update.sh` exécute `npm run build` avant redémarrage.

### Détection du mode production

- **ADDED** : `NODE_ENV=production` dans les unités API et ingest.
- **ADDED** : avertissement au démarrage si `NODE_ENV` est absent alors que la base n'est
  pas locale.

### Exposition réseau

- **MODIFIED** : `API_HOST` par défaut à `127.0.0.1` ; l'écoute publique devient un choix
  explicite et documenté.

### Rate limiting

- **MODIFIED** : `trustProxy` configuré avec une allowlist d'IP de proxy ; le rate-limit
  login s'applique à l'IP réelle **et** à l'identifiant, avec backoff progressif.
- **ADDED** : limitation de débit globale sur `/v1/*` (seuils distincts visiteur/session).
- **ADDED** : budget d'appels sortants Open-Meteo par fenêtre de temps.

### Dépendances

- **MODIFIED** : `nodemailer` 6.10.1 → 9.x (dépinglé) + `@types/nodemailer` ^8.0.1 ;
  `react-router`, `fast-uri`, `nanoid`, `postcss` mis à jour.
- **ADDED** : `npm audit --audit-level=high` dans la vérification pré-commit.

## Impact

- **MODIFIED** : `openspec/specs/{system,auth,notifications}`, `specs/system/baseline-v1.md`
- **MODIFIED** : `deploy/nginx/sncf-alerts.conf`,
  `deploy/systemd/sncf-alerts-{api,ingest}.service`,
  `scripts/{update,setup-letsencrypt}.sh`, `.env.example`
- **REMOVED** : `deploy/systemd/sncf-alerts-web.service`
- **BREAKING** : le déploiement passe d'un serveur Vite à un build statique. Les variables
  `WEB_HOST` / `WEB_PORT` / `WEB_BEHIND_PROXY` / `WEB_TLS_*` / `WEB_ALLOWED_HOSTS` ne
  concernent plus que le développement local.
- Suite : `security-hardening-depth` (CSRF, secrets, validation serveur, confinement
  systemd, TLS Postgres, journal d'audit).
