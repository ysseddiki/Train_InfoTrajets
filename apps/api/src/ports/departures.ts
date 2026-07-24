import type { JourneyConfig } from "@sncf-alerts/shared";

/** Port : récupérer les départs d’une gare (écran). */
export interface DeparturesPort {
  fetchDepartures(journey: JourneyConfig): Promise<unknown>;
}
