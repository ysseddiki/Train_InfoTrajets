# SNCF-Alerts — System Baseline v1.1 (Ops)

> **Statut** : Baseline produit & architecture (ops interne)  
> **Version** : `1.6.0`  
> **Date** : 2026-07-25  
> **Change** : `openspec/changes/ops-smtp-drop-prim`  
> **Format** : OpenSpec

---

## Purpose

SNCF-Alerts est un outil **ops interne** (quelques opérateurs) qui :

1. Surveille **une ou plusieurs liaisons** (chaque liaison = **Aller** `outbound` + **Retour** `inbound`)
2. Affiche un **dashboard** de lecture (stats, état par liaison, historique) — **sans login app**, derrière restriction réseau
3. Expose une **console admin** (login simple) pour configurer liaisons, SMTP, destinataires email, Teams
4. Envoie des notifications via **Email (SMTP custom)** et **Microsoft Teams**

Le client (`apps/web`) et le serveur (`apps/api`) sont séparés. Specs détaillées : `openspec/specs/*`.

---

## Requirements

### Requirement: Baseline ops versionnée

Le système MUST disposer d’une baseline OpenSpec alignée sur le pivot ops (`specs/system/baseline-v1.md` + `openspec/specs/*`).

#### Scenario: Contributeur

- **GIVEN** un contributeur
- **WHEN** il lit cette baseline et `openspec/specs/`
- **THEN** il comprend le périmètre ops A/R, admin, dashboard et canaux Email/Teams

---

## 1. Modèles de données

### 1.1 Entités

```text
AdminAccount (unique)
Liaison ──2 JourneyConfig (outbound | inbound) ──* DisruptionEvent
NotificationSettings ── EmailRecipients[]
                     ── SmtpConfig (secret_ref)
                     ── TeamsConfig (secret_ref)
AlertDelivery *── DisruptionEvent
              *── channel (email | teams)
```

### 1.2 AdminAccount

| Champ | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `username` | string | unique |
| `password_hash` | string | argon2/bcrypt — jamais exposé |
| `created_at` | datetime | UTC |

Pas d’autres users en v1.

### 1.2b Liaison

| Champ | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `name` | string | Custom ; vide → display `origine <-> destination` |
| `updated_at` | datetime | UTC |

### 1.3 JourneyConfig

Un enregistrement par sens (`direction`) **par liaison**.

| Champ | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `liaison_id` | UUID | FK Liaison |
| `direction` | `outbound` \| `inbound` | Unique avec `liaison_id` |
| `label` | string | Ex. « Aller — Nice → Monaco » |
| `origin_id` | string | ID gare **surveillée** (écran départs) |
| `destination_id` | string | ID gare **filtre** = gare **desservie** (pas forcément terminus) |
| `origin_label` | string | Affichage |
| `destination_label` | string | Affichage filtre |
| `network` | string | `ter` (implicite UI) |
| `days_of_week` | int[1..7] | 1=lundi |
| `time_window` | `{ start, end }` | HH:mm, TZ `Europe/Paris` — **fenêtre trajet** |
| `watch_always` | bool | Si true : veille continue sur les `days_of_week` (ignore les heures) |
| `watch_lead_hours` | int 0..12 | Heures avant `time_window.start` pour démarrer la veille (défaut 4 ; ignoré si `watch_always`) |
| `min_delay_minutes` | int | Seuil retard |
| `severities` | string[] | `delay`, `cancellation`, … |
| `active` | bool | Surveillance on/off |
| `updated_at` | datetime | UTC |

### 1.4 DisruptionEvent

| Champ | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `external_event_id` | string | unique (idempotence) |
| `journey_id` | UUID \| null | Leg matché |
| `liaison_id` | UUID \| null | Liaison parente |
| `direction` | `outbound` \| `inbound` \| null | Sens du leg |
| `kind` | enum | delay, cancellation, … |
| `severity` | enum | info, warning, critical |
| `title` | string | |
| `description` | string | |
| `delay_minutes` | int \| null | `null` = durée **unknown** (jamais coercée en `0`) |
| `starts_at` / `ends_at` | datetime | |
| `source` | `stub` \| `navitia` \| `zou` (legacy `prim` en lecture seule) | `zou` = failover GTFS-RT |
| `detected_at` | datetime | |

`raw_payload` : optionnel, rétention courte ; **pas de secrets**.

### 1.4b Station (catalogue)

| Champ | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `external_id` | string | ID Navitia `stop_area` (unique) |
| `label` | string | Affichage |
| `display_url` | string \| null | Lien UI fiche publique (ex. G&C) — **jamais** scrapé |
| `terminus_helpers_enabled` | bool | Défaut false — active les libellés d’aide matching |
| `terminus_helper_labels` | string[] | Terminus / destinations d’aide (ex. Menton) |
| `updated_at` | datetime | UTC |

Pas d’alias scrape G&C. Les liaisons référencent les gares via `external_id`.

### 1.5 NotificationSettings & canaux

| Élément | Stockage | Exposition API |
|---------|----------|----------------|
| SMTP host/port/user/from/TLS | config | visible |
| SMTP password | env ou secret chiffré | `password_configured: true` |
| Teams webhook URL | env ou secret chiffré | `webhook_configured: true` |
| Email recipients | liste en DB | visible (ops, pas PII voyageur) |
| Canaux actifs | `email_enabled`, `teams_enabled` | visible |

### 1.6 AlertDelivery

| Champ | Type | Notes |
|-------|------|-------|
| `id` | UUID | |
| `event_id` | UUID \| null | null si test manuel |
| `direction` | outbound \| inbound \| null | |
| `channel` | `email` \| `teams` | |
| `status` | queued \| sent \| failed \| suppressed | |
| `detail` | string \| null | erreur sanitisée (pas de secret) |
| `sent_at` | datetime \| null | |

Unicité soft : éviter le spam (dédoublonnage par `event_id` + `channel` pour les envois non-test).

---

## 2. Contrats d’API / Interfaces

### Conventions

- Base : `/v1`
- JSON ; erreurs RFC 7807
- Dashboard : **sans** auth app
- Admin : session cookie httpOnly après login

### Dashboard (réseau trusté)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/v1/health` | Santé API |
| GET | `/v1/dashboard/overview` | Stats + statut par liaison |
| GET | `/v1/liaisons` | Config publique des liaisons |
| GET | `/v1/journeys` | Config publique des legs (flat) |
| GET | `/v1/events` | Événements récents (`?direction=`) |
| GET | `/v1/deliveries` | Historique envois |

### Admin (authentifié)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/admin/login` | Login |
| POST | `/v1/admin/logout` | Logout |
| GET | `/v1/admin/me` | Session courante |
| GET/POST | `/v1/admin/liaisons` | Liste / créer |
| GET/PUT/DELETE | `/v1/admin/liaisons/:id` | Lire / maj / supprimer |
| GET/PUT | `/v1/admin/journeys/:direction` | Compat (1ʳᵉ liaison) |
| GET/PUT | `/v1/admin/channels/smtp` | Config SMTP (password write-only) |
| GET/PUT | `/v1/admin/channels/teams` | Webhook Teams (write-only) |
| GET/PUT | `/v1/admin/channels/recipients` | Liste emails |
| GET/PUT | `/v1/admin/ingest` | 3 providers + actif ; token write-only + check API |
| POST | `/v1/admin/ingest/probe` | Test credential (Navitia / PRIM / stub) |
| POST | `/v1/admin/channels/:type/test` | `email` \| `teams` |

### Ports internes

| Port | Rôle |
|------|------|
| `DisruptionIngestPort` | stub \| navitia (+ failover ZOU optionnel) |
| `DeparturesPort` | départs gare (Navitia + cache TTL) |
| `EmailNotifierPort` | SMTP |
| `TeamsNotifierPort` | Incoming webhook |
| `ClockPort` | Testabilité fenêtres horaires |

Pas de scrape / failover Gares & Connexions (bloqué Datadome). URL `displayUrl` catalogue → lien UI seulement. Failover optionnel : GTFS-RT ZOU (`zouFailoverEnabled`). Snapshots board : `navitia` ou `zou`.

---

## 3. Règles métier critiques

### Matching

Notifier seulement si :

1. `JourneyConfig.active` pour le sens
2. Événement match gare surveillée + **filtre gare desservie** (direction / id, pas seulement terminus)
3. Jour + **fenêtre de veille** (TZ Paris) : `watch_always` ou `[start − watch_lead_hours, end]`
4. Sévérité dans la liste configurée
5. Si retard avec durée connue : `delay_minutes >= min_delay_minutes` ; si `delay_minutes` null (unknown), le seuil numérique ne s’applique pas

Le poll ingest et le board (`outside_window`) utilisent la même fenêtre de veille. `time_window` reste l’ancre **trajet** configurée en admin.

File `notify_jobs` : ingest enfile → worker drain SMTP/Teams (API HTTP non bloquée).
### Dédoublonnage

- Idempotence ingest sur `external_event_id`
- Au plus une livraison `sent` par `(event_id, channel)` sauf aggravation significative (retard +≥5 min ou hausse de sévérité)

### Indépendance des canaux

Échec Teams ≠ échec Email.

### Privacy

- Pas de stockage de mots de passe en clair
- Pas de secrets dans git, logs, réponses API
- Destinataires = liste ops saisie par l’admin (pas de comptes users)

---

## 4. Dépendances techniques

### Stack cible

| Couche | Choix |
|--------|-------|
| Monorepo | npm/pnpm workspaces |
| API | Node.js 22 + TypeScript (Fastify) |
| Web | Vite + React + TypeScript |
| Shared | `packages/shared` types |
| DB | PostgreSQL 16 (phase suivante ; mémoire/sqlite OK pour stub initial) |
| Queue | table `notify_jobs` (Postgres) ; Redis optionnel plus tard |
| Auth | session cookie + password hash |
| Workloads | `sncf-alerts-api` ≠ `sncf-alerts-ingest` (systemd) |

### Externes

| Dépendance | Usage |
|------------|-------|
| SMTP custom | Email — config Admin (DB) ; bootstrap `.env` optionnel |
| Teams Incoming Webhook | Notifs Teams (`.env`) |
| Navitia | Ingest prod |
| ZOU GTFS-RT | Failover open data Région Sud |
| Stub | Dev / démo |

### Secrets (env)

Voir `.env.example` : `ADMIN_*`, `SMTP_*`, `TEAMS_*`, `SESSION_SECRET`, `INGEST_INTERVAL_MS`, `INGEST_IN_PROCESS`, `DEPARTURES_CACHE_TTL_MS`, `NAVITIA_DAILY_QUOTA`. **Token Navitia = Admin → Ingest (DB)** — pas dans `.env`. Prometheus : plus tard.

### NFR MVP

- API health < 100 ms
- Détection → notif : viser < 2 min (hors panne provider)
- Login rate-limité
- Dashboard dépend entièrement de l’API

---

## 5. Architecture repo

```text
apps/web          # Dashboard + Admin UI
apps/api          # REST + workers
packages/shared   # Types partagés
openspec/         # Specs + changes
specs/system/     # Baseline narrative
.cursor/rules/    # Agents / règles Cursor
```

---

## Changelog

| Version | Date | Description |
|---------|------|-------------|
| `1.0.0` | 2026-07-23 | Baseline B2C initiale |
| `1.1.0` | 2026-07-23 | Pivot ops A/R, admin, SMTP+Teams, client/serveur |
| `1.1.1` | 2026-07-24 | `delay_minutes` null = unknown (spec ingest + UI/notif) |
| `1.1.2` | 2026-07-24 | Client web : Vite + React + TypeScript |
| `1.2.0` | 2026-07-24 | Multi-liaisons |
| `1.2.1` | 2026-07-24 | Fenêtre de veille (`watch_always` / `watch_lead_hours` 0–12) |
| `1.2.2` | 2026-07-24 | Ingest config en admin (token preview 5 car.) |
| `1.6.0` | 2026-07-25 | Drop PRIM ; SMTP en DB ; autocomplete gares ; ZOU stop_times / multi-feeds |
