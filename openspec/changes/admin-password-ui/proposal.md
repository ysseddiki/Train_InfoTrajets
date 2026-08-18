# Proposal: Mot de passe admin en console

## Why

Le mot de passe admin n’est bootstrapé que via `.env` (`ADMIN_PASSWORD`). Ops doit pouvoir le changer depuis la console, sans redeploy ni `ADMIN_PASSWORD_SYNC`.

## What Changes

- `PUT /v1/admin/account/password` : mot de passe actuel + nouveau (min 8), hash bcrypt, jamais renvoyé
- Section Admin **Compte**
- `.env` reste le bootstrap du **premier** compte ; `ADMIN_PASSWORD_SYNC` MAY encore écraser au boot s’il est `true`

## Impact

- **ADDED** : auth / admin
- **MODIFIED** : baseline endpoints
