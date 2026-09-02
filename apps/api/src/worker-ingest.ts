/**
 * Worker ingest seul (systemd : sncf-alerts-ingest.service).
 * Poll + file notify_jobs — pas de serveur HTTP.
 * Intervalle lu en base selon le provider actif (admin).
 */
import { createIngestAdapter } from "./adapters/ingest.js";
import { migrate } from "./db/pool.js";
import { loadRepoEnv } from "./domain/env.js";
import { processNotifyJobs } from "./domain/notify.js";
import { productionModeWarning } from "./domain/runtime-mode.js";
import { store } from "./domain/store.js";

loadRepoEnv();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const warning = productionModeWarning();
  if (warning) console.warn(`[ingest] ${warning}`);

  await migrate();
  await store.seed();

  const ingest = createIngestAdapter();

  console.log(
    `[ingest] worker started — provider=${await store.getIngestProvider()} poll=${await store.getIngestPollIntervalSeconds()}s`,
  );

  for (;;) {
    try {
      await ingest.poll();
      await processNotifyJobs();
    } catch (err) {
      console.error("[ingest]", err);
    }
    const waitMs = await store.getIngestPollIntervalMs();
    await sleep(waitMs);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
