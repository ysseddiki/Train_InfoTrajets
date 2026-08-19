# Proposal: Accès visiteur, comptes locaux, rôles

## Why

Le dashboard est public (réseau trusté) et la console admin repose sur un **compte unique**. Ops a besoin d’une porte d’entrée (login ou visiteur), de **plusieurs comptes locaux**, et d’un admin filtré par rôle. OIDC viendra plus tard.

## What Changes

- Porte d’entrée : Connexion / Continuer en visiteur. Mode visiteur désactivable (admin).
- Comptes locaux créés uniquement par un admin (pas d’inscription publique). Bootstrap `.env` du 1er admin inchangé.
- Trois rôles exclusifs : `reader`, `liaison_editor`, `admin`.
- APIs dashboard : session **ou** visiteur ON ; sinon `401`.
- Console admin visible selon le rôle (liaisons vs tout).

## Impact

- **MODIFIED** : auth, admin, dashboard, system, baseline
- **ADDED** : mode visiteur, multi-comptes, rôles
- Hors scope : OIDC, self-signup, rôles combinables
