# Delta for Dashboard

## MODIFIED Requirements

### Requirement: Dashboard lecture par liaison

Le dashboard SHALL afficher l’état de chaque liaison (Aller `outbound` + Retour `inbound`), des statistiques agrégées et l’historique récent des livraisons. L’accès applicatif MUST être : session authentifiée, **ou** mode visiteur activé. Le client MUST présenter une porte d’entrée (Connexion / Continuer en visiteur) avant le shell si l’utilisateur n’est pas connecté et n’a pas choisi le mode visiteur.

#### Scenario: Affichage des liaisons (visiteur)

- **GIVEN** une ou plusieurs liaisons configurées et le mode visiteur activé
- **WHEN** un visiteur a choisi « Continuer en visiteur »
- **THEN** il voit le statut Aller/Retour de chaque liaison et les derniers événements

#### Scenario: Login obligatoire

- **GIVEN** le mode visiteur désactivé et aucune session
- **WHEN** un client ouvre l’app
- **THEN** seule la porte d’entrée (connexion) est affichée
- **AND** les APIs dashboard répondent `401`
