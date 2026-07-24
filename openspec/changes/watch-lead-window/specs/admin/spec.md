# Delta for Admin

## ADDED Requirements

### Requirement: Config veille par sens

La console admin SHALL permettre, pour Aller et Retour, de configurer la veille :

- checkbox **Veille continue** (`watch_always`)
- liste **Commencer la veille N h avant** la fenêtre trajet (`watch_lead_hours`, 0 à 12)

Si **Veille continue** est cochée, la liste MUST être désactivée (grisée) ; la valeur sélectionnée MAY être conservée.

#### Scenario: Lead grisé

- **GIVEN** un admin édite l’Aller avec Veille continue cochée
- **WHEN** le formulaire s’affiche
- **THEN** le select 0–12 h est disabled
