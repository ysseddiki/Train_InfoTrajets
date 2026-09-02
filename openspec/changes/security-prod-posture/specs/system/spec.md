# System — delta security-prod-posture

## MODIFIED Requirements

### Requirement: Durcissement HTTP et CORS

Le client web MUST être servi en production sous forme de **build statique** par le
reverse-proxy. Le serveur de développement Vite MUST NOT être utilisé comme serveur de
production. La CSP MUST NOT inclure `'unsafe-inline'` dans `script-src`.

L'API MUST écouter par défaut sur une interface locale (`127.0.0.1`). Une écoute publique
MUST être un choix explicite, documenté comme exigeant un pare-feu fermé, afin que HSTS,
CSP et limitation de débit du reverse-proxy ne soient pas contournables.

Le système MUST appliquer une limitation de débit sur `/v1/*` (API) et sur les routes
d'authentification (reverse-proxy). Les appels sortants vers des services tiers déclenchés
par une route accessible sans session MUST être bornés par un budget par fenêtre de temps.

#### Scenario: Pas de serveur de dev en production

- **GIVEN** un déploiement avec `NODE_ENV=production`
- **WHEN** on inspecte le service web
- **THEN** un build statique est servi par nginx (aucun processus `vite`, aucun endpoint HMR)
- **AND** aucun sourcemap de production n'est exposé publiquement

#### Scenario: API non joignable hors proxy

- **GIVEN** nginx en terminaison TLS et la configuration par défaut
- **WHEN** on tente d'atteindre `http://<ip-publique>:3001/v1/health`
- **THEN** la connexion échoue (écoute locale uniquement)

#### Scenario: Débit borné sur les routes de lecture

- **GIVEN** le mode visiteur actif
- **WHEN** un client sans session dépasse le seuil de requêtes `/v1/*`
- **THEN** la réponse est `429` avec un `Retry-After`

#### Scenario: Amplification météo bornée

- **GIVEN** le mode visiteur actif
- **WHEN** un client non authentifié interroge `/v1/dashboard/day` sur de nombreuses dates
- **THEN** le budget d'appels Open-Meteo par fenêtre n'est pas dépassé
- **AND** la réponse reste valide sans météo plutôt que de déclencher un appel sortant

### Requirement: Documentation déploiement adminsys

Le dépôt SHALL documenter le déploiement (systemd, reverse-proxy, TLS) et fournir les
unités correspondantes.

Les unités de déploiement MUST définir `NODE_ENV=production` pour l'API et le worker
d'ingest, afin que les gardes conditionnées à ce mode soient effectives. Le déploiement
web MUST reposer sur un build statique servi par nginx, sans unité systemd dédiée à l'UI.

#### Scenario: Unité systemd conforme

- **GIVEN** les unités de déploiement du dépôt
- **WHEN** on les inspecte
- **THEN** `NODE_ENV=production` est défini pour l'API et le worker d'ingest
- **AND** aucune unité ne lance de serveur de développement
