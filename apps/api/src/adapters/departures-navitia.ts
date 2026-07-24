import type { JourneyConfig } from "@sncf-alerts/shared";
import { departuresCache } from "../domain/departures-cache.js";
import type { DeparturesPort } from "../ports/departures.js";
import { store } from "../domain/store.js";

export type NavitiaDeparture = {
  display_informations?: {
    direction?: string;
    headsign?: string;
    trip_short_name?: string;
    name?: string;
    label?: string;
    number?: string;
    commercial_mode?: { name?: string };
  };
  route?: {
    direction?: { name?: string; id?: string };
  };
  stop_date_time?: {
    base_departure_date_time?: string;
    departure_date_time?: string;
  };
  stop_point?: { id?: string };
};

/**
 * Adapter Navitia derrière DeparturesPort + cache TTL process.
 */
export class NavitiaDeparturesPort implements DeparturesPort {
  constructor(private readonly token: string) {}

  async fetchDepartures(
    journey: JourneyConfig,
  ): Promise<{ departures: NavitiaDeparture[] }> {
    const cacheKey = `dep:${journey.originId}`;
    const cached = departuresCache.get(cacheKey) as
      | { departures?: NavitiaDeparture[] }
      | undefined;
    if (cached) {
      return { departures: cached.departures ?? [] };
    }

    const stopId = encodeURIComponent(journey.originId);
    const url = `https://api.sncf.com/v1/coverage/sncf/stop_areas/${stopId}/departures?count=20&data_freshness=realtime`;

    let res: Response;
    try {
      res = await fetch(url, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${this.token}:`).toString("base64")}`,
        },
      });
    } catch (err) {
      await store.recordApiRequest({ provider: "navitia", ok: false });
      throw err;
    }

    if (!res.ok) {
      await store.recordApiRequest({ provider: "navitia", ok: false });
      throw new Error(`Navitia HTTP ${res.status} (${journey.direction})`);
    }

    await store.recordApiRequest({ provider: "navitia", ok: true });
    const body = (await res.json()) as { departures?: NavitiaDeparture[] };
    departuresCache.set(cacheKey, body);
    return { departures: body.departures ?? [] };
  }
}
