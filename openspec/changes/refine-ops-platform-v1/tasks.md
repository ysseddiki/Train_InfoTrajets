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

## 3. API foundation (prochaine itération code)

- [ ] 3.1 Healthcheck `GET /v1/health`
- [ ] 3.2 Auth admin login/logout + session
- [ ] 3.3 CRUD journeys Aller/Retour
- [ ] 3.4 Config SMTP + destinataires + Teams (masked)
- [ ] 3.5 Endpoints dashboard lecture
- [ ] 3.6 Ingest stub + matching A/R
- [ ] 3.7 Notifiers email + Teams + test send

## 4. Web foundation (prochaine itération code)

- [ ] 4.1 Page Dashboard (A/R + stats)
- [ ] 4.2 Page Admin login + console config
- [ ] 4.3 Client API typé via `packages/shared`

## 5. Hardening

- [ ] 5.1 Rate-limit login
- [ ] 5.2 Audit logs sans secrets
- [ ] 5.3 Documentation déploiement réseau (VPN/firewall)
