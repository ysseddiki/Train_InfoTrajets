/**
 * Worker ingest seul (systemd : sncf-alerts-ingest.service).
 * Poll + file notify_jobs — pas de serveur HTTP.
 */
import { createIngestAdapter } from "./adapters/ingest.js";
import { migrate } from "./db/pool.js";
import { loadRepoEnv } from "./domain/env.js";
import { processNotifyJobs } from "./domain/notify.js";
import { store } from "./domain/store.js";

loadRepoEnv();

async function main() {
  await migrate();
  await store.seed();

  const ingest = createIngestAdapter();
  const intervalMs = Number(process.env.INGEST_INTERVAL_MS ?? 300_000);

  const tick = async () => {
    try {
      await ingest.poll();
      await processNotifyJobs();
    } catch (err) {
      console.error("[ingest]", err);
    }
  };

  console.log(
    `[ingest] worker started — interval ${intervalMs}ms provider=${await store.getIngestProvider()}`,
  );
  await tick();
  setInterval(() => {
    void tick();
  }, intervalMs);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
