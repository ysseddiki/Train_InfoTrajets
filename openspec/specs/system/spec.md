# System Specification

## Purpose

SNCF-Alerts est un outil **ops interne** qui surveille une ou plusieurs **liaisons** SNCF (chaque liaison = Aller + Retour), affiche un dashboard de lecture (session ou visiteur), permet de configurer cibles et canaux selon le rôle, et envoie des alertes via **Email (SMTP custom)** et **Microsoft Teams**.

Le client (`apps/web`) et le serveur (`apps/api`) sont strictement séparés. Les secrets et intégrations externes restent côté serveur. Comptes **locaux** (rôles `reader` / `liaison_editor` / `admin`) ; pas de comptes voyageurs B2C ni de canal push.

## Requirements

### Requirement: Produit ops interne Aller/Retour

Le système SHALL être un outil ops interne qui surveille une ou plusieurs liaisons (chaque liaison = `outbound` / Aller et `inbound` / Retour), expose un dashboard de lecture (session ou visiteur) et une console admin selon le rôle, et notifie via Email (SMTP) et Teams. Les comptes sont **locaux** (un rôle parmi `reader`, `liaison_editor`, `admin`), créés par un admin. Pas de comptes voyageurs B2C ni de canal push.

#### Scenario: Périmètre

- **GIVEN** le déploiement
- **WHEN** un opérateur utilise le produit
- **THEN** les surfaces Dashboard, Notifications, Trains (admin) et Admin (filtrée) sont disponibles
- **AND** aucun compte voyageur ni canal push n’existe
- **AND** au moins une liaison est configurée (seed par défaut)
- **AND** aucune source d’ingest scrape Gares & Connexions n’est disponible

Hors scope v1 explicite : scrape / failover G&C (Datadome) ; `displayUrl` catalogue = lien UI seulement.

### Requirement: Séparation client/serveur

Le client web MUST n’appeler que l’API HTTP `/v1` ; les intégrations Navitia, SMTP et Teams MUST s’exécuter uniquement côté serveur.

#### Scenario: Pas de secret dans le front

- **GIVEN** le bundle `apps/web`
- **WHEN** on inspecte le code client
- **THEN** aucune clé API, mot de passe SMTP ou webhook Teams n’y figure

### Requirement: Privacy et secrets

Le système MUST NOT stocker de mots de passe en clair, MUST NOT committer de secrets dans git, et MUST masquer les credentials dans les réponses API (`configured` / `****`).

Les secrets opérationnels persistés en base (`app_meta`) — **mot de passe SMTP** et **token Navitia** — MUST être chiffrés au repos en **AES-256-GCM** lorsque `SECRETS_ENCRYPTION_KEY` est défini. Sans la clé, le stockage en clair est toléré en dev uniquement et MUST être documenté comme déconseillé en production. La lecture serveur MUST déchiffrer de façon transparente (et tolérer une valeur legacy en clair).

#### Scenario: Lecture config SMTP

- **GIVEN** un SMTP configuré avec mot de passe
- **WHEN** l’admin appelle `GET /v1/admin/channels/smtp`
- **THEN** la réponse n’inclut pas le mot de passe en clair
- **AND** indique que le secret est configuré

#### Scenario: Secret chiffré en base

- **GIVEN** `SECRETS_ENCRYPTION_KEY` défini et un token Navitia enregistré via Admin
- **WHEN** on lit la ligne `app_meta` correspondante en SQL
- **THEN** la valeur stockée est au format `iv:tag:ciphertext` (hex), pas le token en clair
- **AND** l’ingest utilise la valeur déchiffrée pour appeler Navitia

### Requirement: Durcissement HTTP et CORS

L’API MUST appliquer des en-têtes de sécurité sur toutes les réponses (`X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`, `Permissions-Policy`, `Cross-Origin-Resource-Policy`) et un `Cache-Control: no-store` sur les routes `/v1/admin/*`. Un filet de sécurité MUST exiger une session pour toute route `/v1/admin/*` hors login/logout (défense en profondeur, avant le contrôle des rôles).

CORS MUST refléter uniquement les origines listées dans `CORS_ORIGINS` (séparées par virgules). La liste vide MUST refuser toute origine navigateur cross-origin (l’UI passe par le proxy same-origin). `origin: true` combiné à `credentials: true` MUST NOT être utilisé.

Le vhost nginx de la web UI MUST ajouter une `Content-Security-Policy` restrictive (`default-src 'self'`, `frame-ancestors 'none'`) en plus de HSTS / nosniff / X-Frame-Options / Referrer-Policy. La CSP MUST NOT inclure `'unsafe-inline'` dans `script-src`.

Le client web MUST être servi en production sous forme de **build statique** par le reverse-proxy. Le serveur de développement Vite MUST NOT être utilisé comme serveur de production (sources, sourcemaps, HMR et middlewares de dev hors surface exposée).

L’API MUST écouter par défaut sur une interface locale (`127.0.0.1`). Une écoute publique MUST être un choix explicite, documenté comme exigeant un pare-feu fermé, afin que HSTS, CSP et limitation de débit du reverse-proxy ne soient pas contournables.

Le système MUST appliquer une limitation de débit sur `/v1/*` (API, par IP réelle) et sur les routes d’authentification (reverse-proxy). Les appels sortants vers des services tiers déclenchés par une route accessible sans session MUST être bornés par un budget par fenêtre de temps.

#### Scenario: Pas de serveur de dev en production

- **GIVEN** un déploiement avec `NODE_ENV=production`
- **WHEN** on inspecte le service web
- **THEN** un build statique est servi par nginx (aucun processus `vite`, aucun endpoint HMR)
- **AND** aucun sourcemap de production n’est exposé publiquement

#### Scenario: API non joignable hors proxy

- **GIVEN** nginx en terminaison TLS et la configuration par défaut
- **WHEN** on tente d’atteindre `http://<ip-publique>:3001/v1/health`
- **THEN** la connexion échoue (écoute locale uniquement)

#### Scenario: Débit borné sur les routes de lecture

- **GIVEN** le mode visiteur actif
- **WHEN** un client sans session dépasse le seuil de requêtes `/v1/*`
- **THEN** la réponse est `429` avec un `Retry-After`

#### Scenario: Amplification météo bornée

- **GIVEN** le mode visiteur actif
- **WHEN** un client non authentifié interroge `/v1/dashboard/day` sur de nombreuses dates
- **THEN** le budget d’appels Open-Meteo par fenêtre n’est pas dépassé
- **AND** la réponse reste valide sans météo plutôt que de déclencher un appel sortant

#### Scenario: Origine non autorisée

- **GIVEN** `CORS_ORIGINS` vide et une requête navigateur cross-origin avec `Origin: https://malicious.example`
- **WHEN** le navigateur appelle l’API avec credentials
- **THEN** la réponse n’inclut pas `Access-Control-Allow-Origin` pour cette origine

#### Scenario: Headers admin

- **GIVEN** une session admin
- **WHEN** elle appelle `GET /v1/admin/liaisons`
- **THEN** la réponse inclut `Cache-Control: no-store` et les en-têtes de sécurité

### Requirement: Stack client web React

Le client `apps/web` MUST être une application **Vite + React + TypeScript**. Il MUST n’appeler que l’API HTTP `/v1` et MUST NOT embarquer de logique d’ingest ni de secrets (SMTP, webhooks, clés Navitia).

En production, il MUST être déployé sous forme de build statique (`vite build` → `apps/web/dist`) ; le serveur de développement est réservé au poste local. `index.html` MUST NOT contenir de `<script>` inline ni de gestionnaire d’événement inline, afin que la CSP puisse interdire `script-src 'unsafe-inline'` (l’amorçage du thème vit dans `public/theme-boot.js`).

#### Scenario: Bundle web

- **GIVEN** le package `apps/web`
- **WHEN** un contributeur inspecte la stack
- **THEN** l’UI est construite avec React sous Vite
- **AND** les appels réseau passent par le client `/v1` partagé

#### Scenario: Évolution UI

- **GIVEN** une évolution du dashboard ou de l’admin
- **WHEN** on ajoute un composant ou une route
- **THEN** elle s’inscrit dans l’arborescence React (`pages` / `components`) sans templates HTML string globaux

### Requirement: Documentation déploiement adminsys

Le dépôt SHALL documenter le déploiement de production via **Docker Compose**
(`docker-compose.prod.yml`) comme méthode recommandée : services `db`, `api`, `ingest`,
`web` (nginx + build statique). Un script `scripts/deploy-docker.sh` SHALL automatiser
build et démarrage.

Les unités systemd (`deploy/systemd/`) MAY rester documentées comme alternative bare-metal.

En mode conteneurisé, l’API et l’ingest MUST NOT publier de ports sur l’hôte ; seul le
service `web` expose HTTP/HTTPS. `NODE_ENV=production` MUST être défini pour l’API et
l’ingest (variable d’environnement du compose ou des unités systemd).

#### Scenario: Stack compose opérationnelle

- **GIVEN** un serveur avec Docker et le fichier `.env` configuré
- **WHEN** on exécute `./scripts/deploy-docker.sh`
- **THEN** les conteneurs `db`, `api`, `ingest` et `web` sont `running`
- **AND** l’UI est joignable via HTTPS sur le port 443 du conteneur `web`
- **AND** l’API n’est pas joignable directement depuis l’extérieur du réseau Docker

#### Scenario: TLS Let's Encrypt en Docker

- **GIVEN** le DNS pointe vers le serveur et la stack est démarrée
- **WHEN** on exécute `./scripts/init-letsencrypt-docker.sh <domaine> <email>`
- **THEN** un certificat est obtenu via HTTP-01
- **AND** nginx recharge les certificats sans reconstruire l’image `web`

#### Scenario: Install units (bare-metal legacy)

- **GIVEN** un serveur Linux avec le repo déployé
- **WHEN** l’adminsys copie `deploy/systemd/*.service` et active les services
- **THEN** l’API et l’ingest peuvent tourner en process séparés

#### Scenario: Unité systemd conforme

- **GIVEN** les unités de déploiement du dépôt
- **WHEN** on les inspecte
- **THEN** `NODE_ENV=production` est défini pour l’API et le worker d’ingest
- **AND** aucune unité ne lance de serveur de développement
