# Proposal: Durcissement sécurité + accessibilité + UX (v1.15.0)

Revue complète UI/UX + sécurité (2026-08-28). Correctifs appliqués et spécifiés.

## Sécurité

- **CORS** : `origin: true` remplacé par une allowlist `CORS_ORIGINS` (vide = deny navigateur cross-origin). Module `cors-origin.ts` désormais câblé.
- **Guard admin** : `registerAdminGuard` enregistré au bootstrap — headers de sécurité sur toutes les réponses, `no-store` sur `/v1/admin/*`, filet session avant RBAC.
- **Secrets au repos** : SMTP password + token Navitia chiffrés AES-256-GCM dans `app_meta` quand `SECRETS_ENCRYPTION_KEY` est défini (déchiffrement transparent, tolère le clair legacy).
- **Bootstrap prod** : refus de démarrer si `NODE_ENV=production` et `ADMIN_PASSWORD=changeme`.
- **Visiteur fail-closed** : si `/v1/auth/config` échoue, la UI traite `visitorEnabled = false`.
- **CSP** : `Content-Security-Policy` + `Permissions-Policy` ajoutés au vhost nginx.
- **Reset mot de passe UI** : `window.prompt` remplacé par une validation longueur min côté client.

## Accessibilité

- Dialog gare : `aria-modal`, focus initial, Échap.
- `IndicatorPeriodSwitch`, `LiaisonScopePicker`, nav admin : navigation flèches / Home / End, `tabIndex` roving.
- Messages de formulaire : `role="alert"`.
- Skip link vers `#main-content`, `:focus-visible` global.
- Heatmap : cellules 14 px (18 px mobile), indice non colorimétrique (ombre interne croissante), sélection via token de thème.

## UX / perf

- Code splitting des routes (`React.lazy` + `Suspense`).
- Skeleton de chargement dashboard (respect `prefers-reduced-motion`).
- Boutons « Réessayer » sur les pages en erreur (Notifications, Admin).
- Validation format des emails destinataires côté client.
- Sections admin deep-linkables (`#/admin?section=…`).
- Couleurs hardcodées claires remplacées par des tokens (debug, sélection heatmap).
- `PeriodStats.tsx` (mort) supprimé ; fonts Google chargées en non-bloquant.

## Specs modifiées

- `openspec/specs/system/spec.md` : requirements « Privacy et secrets » (chiffrement) + « Durcissement HTTP et CORS » (nouveau).
- `openspec/specs/auth/spec.md` : bootstrap prod, fail-closed visiteur, reset mot de passe UI.
- `openspec/specs/dashboard/spec.md` : format panneau Motifs (= Météo), heatmap a11y, requirement « Accessibilité et chargement des surfaces ».
- `openspec/specs/admin/spec.md` : deep-link sections, validation emails, scénarios associés.
