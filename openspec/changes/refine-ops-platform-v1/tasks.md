# Tasks: Refine Ops Platform v1

## 1. OpenSpec & baseline

- [x] 1.1 Rédiger proposal / design / tasks
- [x] 1.2 Écrire deltas par domaine
- [x] 1.3 Réécrire `specs/system/baseline-v1.md` (ops)
- [x] 1.4 Publier specs courantes sous `openspec/specs/*`

## 2. Repo skeleton

- [x] 2.1 Monorepo `apps/api`, `apps/web`, `packages/shared`
- [x] 2.2 `.gitignore`, `.env.example`
- [x] 2.3 README (setup + obtention clés API)
- [x] 2.4 Règles `.cursor` (global + domaines)

## 3. API foundation

- [x] 3.1 Healthcheck `GET /v1/health`
- [x] 3.2 Auth admin login/logout + session cookie httpOnly + bcrypt + rate-limit
- [x] 3.3 CRUD journeys Aller/Retour (Postgres)
- [x] 3.4 Config SMTP/Teams (env, masked) + destinataires (DB) + test send
- [x] 3.5 Endpoints dashboard lecture
- [x] 3.6 Ingest stub + matching fenêtres A/R + debug admin inject
- [x] 3.7 Notifiers email + Teams

## 4. Web foundation

- [x] 4.1 Page Dashboard (A/R + stats)
- [x] 4.2 Page Admin login + console config + debug
- [x] 4.3 Client API credentials/cookie via `packages/shared` types
- [x] 4.4 Page `#/notifications` (historique)

## 5. Hardening

- [x] 5.1 Rate-limit login
- [x] 5.2 Audit logs sans secrets (redaction)
- [ ] 5.3 Documentation déploiement réseau (VPN/firewall) — partiel via README

## 6. Suite

- [ ] 6.1 Adapter PRIM / Navitia réel
- [ ] 6.2 Persistance config SMTP hors env (optionnel)
