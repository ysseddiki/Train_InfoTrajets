import type { IngestProviderId } from "@sncf-alerts/shared";
import { store } from "./store.js";

/**
 * Interrupteurs ops (feature flags v1) :
 * provider stub | navitia | prim + mode process.
 * Source : Admin → Ingest (DB) + env process.
 */
export interface FeatureFlags {
  ingestProvider: IngestProviderId;
  /** true = poll dans le process API ; false = worker systemd dédié */
  ingestInProcess: boolean;
  /** Prometheus / métriques scrape — hors scope pour l’instant */
  prometheusEnabled: boolean;
  /** TEMP — failover scrape Gares & Connexions */
  gcFailoverEnabled: boolean;
}

export async function getFeatureFlags(): Promise<FeatureFlags> {
  return {
    ingestProvider: await store.getIngestProvider(),
    ingestInProcess: process.env.INGEST_IN_PROCESS !== "false",
    prometheusEnabled: false,
    gcFailoverEnabled: await store.isGcFailoverEnabled(),
  };
}
