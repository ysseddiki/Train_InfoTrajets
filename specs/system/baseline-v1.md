# SNCF-Alerts — System Baseline v1.1 (Ops)

> **Statut** : Baseline produit & architecture (ops interne)  
> **Version** : `1.1.2`  
> **Date** : 2026-07-24  
> **Change** : `openspec/changes/adopt-react-web`  
> **Format** : OpenSpec

---

## Purpose

SNCF-Alerts est un outil **ops interne** (quelques opérateurs) qui :

1. Surveille **deux trajets** configurés : **Aller** (`outbound`) et **Retour** (`inbound`)
2. Affiche un **dashboard** de lecture (stats, état A/R, historique) — **sans login app**, derrière restriction réseau
3. Expose une **console admin** (login simple) pour configurer trajets, SMTP, destinataires email, Teams
4. Envoie des notifications via **Email (SMTP custom)** et **Microsoft Teams**

Le client (`apps/web`) et le serveur (`apps/api`) sont séparés. Specs détaillées : `openspec/specs/*`.

### Hors scope v1

- Comptes viewer / inscription voyageurs (version lointaine possible)
- SSO / OIDC / 2FA
- Push, SMS
- Plus de deux trajets
- Billetterie, itinéraires alternatifs

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
JourneyConfig (outbound | inbound) ──* DisruptionEvent
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

### 1.3 JourneyConfig

Un enregistrement par sens (`direction`).

| Champ | Type | Notes |
|-------|------|-------|
| `direction` | `outbound` \| `inbound` | PK logique (Aller / Retour) |
| `label` | string | Ex. « Maison → Bureau » |
| `origin_id` | string | ID gare/source externe |
| `destination_id` | string | ID gare/source externe |
| `origin_label` | string | Affichage |
| `destination_label` | string | Affichage |
| `network` | string | ex. `transilien`, `ter` |
| `days_of_week` | int[1..7] | 1=lundi |
| `time_window` | `{ start, end }` | HH:mm, TZ `Europe/Paris` |
| `min_delay_minutes` | int | Seuil retard |
| `severities` | string[] | `delay`, `cancellation`, … |
| `active` | bool | Surveillance on/off |
| `updated_at` | datetime | UTC |

### 1.4 DisruptionEvent

| Champ | Type | Notes |
|-------|------|-------|
| `id` | UUID | PK |
| `external_event_id` | string | unique (idempotence) |
| `direction` | `outbound` \| `inbound` \| null | Match ou non matché |
| `severity` | enum | delay, cancellation, … |
| `severity` | enum | info, warning, critical |
| `title` | string | |
| `description` | string | |
| `delay_minutes` | int \| null | `null` = durée **unknown** (jamais coercée en `0`) |
| `starts_at` / `ends_at` | datetime | |
| `source` | `stub` \| `prim` \| `navitia` | |
| `detected_at` | datetime | |

`raw_payload` : optionnel, rétention courte ; **pas de secrets**.

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
| GET | `/v1/dashboard/overview` | Stats + statut A/R |
| GET | `/v1/journeys` | Config publique des 2 trajets (sans secrets) |
| GET | `/v1/events` | Événements récents (`?direction=`) |
| GET | `/v1/deliveries` | Historique envois |

### Admin (authentifié)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/v1/admin/login` | Login |
| POST | `/v1/admin/logout` | Logout |
| GET | `/v1/admin/me` | Session courante |
| GET/PUT | `/v1/admin/journeys/:direction` | `outbound` \| `inbound` |
| GET/PUT | `/v1/admin/channels/smtp` | Config SMTP (password write-only) |
| GET/PUT | `/v1/admin/channels/teams` | Webhook Teams (write-only) |
| GET/PUT | `/v1/admin/channels/recipients` | Liste emails |
| POST | `/v1/admin/channels/:type/test` | `email` \| `teams` |

### Ports internes

| Port | Rôle |
|------|------|
| `DisruptionIngestPort` | stub \| prim \| navitia |
| `EmailNotifierPort` | SMTP |
| `TeamsNotifierPort` | Incoming webhook |
| `ClockPort` | Testabilité fenêtres horaires |

---

## 3. Règles métier critiques

### Matching

Notifier seulement si :

1. `JourneyConfig.active` pour le sens
2. Événement match origine/destination (ou ligne associée)
3. Jour + fenêtre horaire (TZ Paris)
4. Sévérité dans la liste configurée
5. Si retard avec durée connue : `delay_minutes >= min_delay_minutes` ; si `delay_minutes` null (unknown), le seuil numérique ne s’applique pas

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
| Queue | optionnel Redis plus tard ; worker in-process OK MVP |
| Auth | session cookie + password hash |

### Externes

| Dépendance | Usage |
|------------|-------|
| SMTP custom | Email |
| Teams Incoming Webhook | Notifs Teams |
| PRIM et/ou Navitia | Ingest prod (une seule active) |
| Stub | Dev / démo |

### Secrets (env)

Voir `.env.example` : `ADMIN_USERNAME`, `ADMIN_PASSWORD`, `SMTP_*`, `TEAMS_WEBHOOK_URL`, `PRIM_API_KEY`, `NAVITIA_TOKEN`, `INGEST_PROVIDER`, `SESSION_SECRET`.

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
