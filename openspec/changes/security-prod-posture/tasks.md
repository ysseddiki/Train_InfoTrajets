# Tasks: security-prod-posture

## 1. OpenSpec

- [x] 1.1 proposal / tasks
- [x] 1.2 deltas system / auth / notifications
- [x] 1.3 baseline 1.16.0 + changelog

## 2. NODE_ENV (H1)

- [x] 2.1 `Environment=NODE_ENV=production` dans les unités API et ingest
- [x] 2.2 Avertissement au démarrage si `NODE_ENV` absent et `DATABASE_URL` non local
      (`domain/runtime-mode.ts`, appelé par `index.ts` et `worker-ingest.ts`)
- [x] 2.3 Documenter dans `.env.example` + AGENTS.md § dépannage

## 3. Rate limiting (H2, H5)

- [x] 3.1 `trustProxy` Fastify avec allowlist (`TRUSTED_PROXIES`, défaut `loopback`)
- [x] 3.2 Rate-limit login par IP réelle **et** par identifiant, backoff progressif
- [x] 3.3 Ne plus réinitialiser un compteur d'IP tierce après un succès
- [x] 3.4 Rate-limit global `/v1/*` par IP (`READ_RATE_MAX`, hook `onRequest`)
- [x] 3.5 Budget d'appels Open-Meteo par fenêtre (`OutboundBudget`) — au-delà, réponse
      sans météo plutôt qu'appel sortant
- [x] 3.6 `limit_req` / `limit_conn` nginx sur `/v1/admin/login` et `/v1/`

- [x] 3.7 Corriger la lecture des seuils : ils étaient lus au chargement du module, donc
      **avant** `loadRepoEnv()` — toute valeur du `.env` était silencieusement ignorée.
      Nouveau helper `envPositiveInt` (rejette aussi `0`, négatifs et `NaN`, qui
      auraient désactivé la limite).

Note 3.4 : le plafond est volontairement large (300 req/min) pour ne pas gêner l'UI ;
c'est le budget 3.5 qui borne réellement l'amplification externe.

## 4. Dépendances (H3)

- [x] 4.1 `nodemailer` → `^9.1.1` (dépinglé), `@types/nodemailer` → `^8.0.1`
- [x] 4.2 `createTransport` / `sendMail` inchangés — typecheck au vert
- [x] 4.3 `npm audit fix` (react-router, fast-uri, nanoid, postcss)
- [x] 4.4 `npm audit --audit-level=high` : 0 vulnérabilité

## 5. Exposition réseau (H4)

- [x] 5.1 `API_HOST` par défaut `127.0.0.1` dans le code et `.env.example`
- [x] 5.2 Cas d'écoute publique documenté (pare-feu obligatoire) — README § Exposition réseau

## 6. Build statique (C1)

- [x] 6.1 `npm run build -w @sncf-alerts/web` → `apps/web/dist` (sourcemap désactivée)
- [x] 6.2 nginx : `root WEB_ROOT`, `try_files`, cache long sur `/assets/`
- [x] 6.3 `sncf-alerts-web.service` supprimé ; `setup-letsencrypt.sh` désinstalle
      l'ancienne unité et purge les `WEB_*` de `.env`
- [x] 6.4 `scripts/update.sh` : `npm install` → `npm run build -w @sncf-alerts/web`
- [x] 6.5 `script-src 'self'` : le `<script>` inline (thème) et le `onload=` inline
      (webfonts) sont déplacés dans `apps/web/public/theme-boot.js`
- [~] 6.6 `style-src` : `'unsafe-inline'` conservé **en repli**, encadré par
      `style-src-elem 'self'` (aucun `<style>` injecté ne passe) et
      `style-src-attr 'unsafe-inline'`. Retrait complet impossible sans refondre les
      largeurs dynamiques de `QuotaPanel` → reporté à `security-hardening-depth`.
- [x] 6.7 `WEB_*` réservé au dev ; `vite.config.ts` n'ouvre plus `allowedHosts: true`
      par défaut ; README + AGENTS.md à jour

Note 6.5 : la CSP autorise désormais explicitement `fonts.googleapis.com` /
`fonts.gstatic.com`, qui étaient chargés par `index.html` mais bloqués par l'ancienne
CSP (`style-src 'self'` / `font-src 'self'`) — les webfonts ne s'appliquaient donc pas
en production. L'auto-hébergement des polices est à arbitrer dans le change suivant.

## 7. Vérification

- [x] 7.1 Test : rate-limit login discriminant par IP et par identifiant
      (`rate-limit.test.ts`)
- [x] 7.2 Test : allowlist de proxies (`trusted-proxies.test.ts`)
- [x] 7.3 `npm run typecheck` + `npm run test` (93) + `npm audit` au vert
