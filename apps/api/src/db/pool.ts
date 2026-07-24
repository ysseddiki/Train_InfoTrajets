import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is required. See README PostgreSQL section.",
      );
    }
    pool = new Pool({ connectionString });
  }
  return pool;
}

async function tableExists(p: pg.Pool, table: string): Promise<boolean> {
  const res = await p.query(
    `SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = $1`,
    [table],
  );
  return (res.rowCount ?? 0) > 0;
}

async function columnExists(
  p: pg.Pool,
  table: string,
  column: string,
): Promise<boolean> {
  const res = await p.query(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
    [table, column],
  );
  return (res.rowCount ?? 0) > 0;
}

/** Migrate pre-liaison `journeys` (PK direction) → liaisons + journey rows. */
async function migrateLegacyJourneys(p: pg.Pool): Promise<void> {
  const hasJourneys = await tableExists(p, "journeys");
  if (!hasJourneys) return;
  if (await columnExists(p, "journeys", "liaison_id")) return;

  await p.query(`CREATE TABLE IF NOT EXISTS liaisons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  await p.query(`ALTER TABLE journeys RENAME TO journeys_legacy`);

  await p.query(`
    CREATE TABLE journeys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      liaison_id UUID NOT NULL REFERENCES liaisons(id) ON DELETE CASCADE,
      direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
      label TEXT NOT NULL,
      origin_id TEXT NOT NULL DEFAULT '',
      destination_id TEXT NOT NULL DEFAULT '',
      origin_label TEXT NOT NULL DEFAULT '',
      destination_label TEXT NOT NULL DEFAULT '',
      network TEXT NOT NULL DEFAULT 'ter',
      days_of_week INT[] NOT NULL DEFAULT '{1,2,3,4,5}',
      window_start TEXT NOT NULL DEFAULT '07:00',
      window_end TEXT NOT NULL DEFAULT '09:30',
      min_delay_minutes INT NOT NULL DEFAULT 10,
      severities TEXT[] NOT NULL DEFAULT '{delay,cancellation}',
      active BOOLEAN NOT NULL DEFAULT false,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (liaison_id, direction)
    )
  `);

  const liaisonRes = await p.query(
    `INSERT INTO liaisons (name, updated_at) VALUES ('', now()) RETURNING id`,
  );
  const liaisonId = String(liaisonRes.rows[0].id);

  await p.query(
    `INSERT INTO journeys (
      liaison_id, direction, label, origin_id, destination_id, origin_label, destination_label,
      network, days_of_week, window_start, window_end, min_delay_minutes, severities, active, updated_at
    )
    SELECT
      $1, direction, label, origin_id, destination_id, origin_label, destination_label,
      network, days_of_week, window_start, window_end, min_delay_minutes, severities, active, updated_at
    FROM journeys_legacy`,
    [liaisonId],
  );

  await p.query(`DROP TABLE journeys_legacy`);
}

async function ensureEventLiaisonColumns(p: pg.Pool): Promise<void> {
  if (!(await tableExists(p, "disruption_events"))) return;
  if (!(await columnExists(p, "disruption_events", "journey_id"))) {
    await p.query(`ALTER TABLE disruption_events ADD COLUMN journey_id UUID`);
  }
  if (!(await columnExists(p, "disruption_events", "liaison_id"))) {
    await p.query(`ALTER TABLE disruption_events ADD COLUMN liaison_id UUID`);
  }
}

async function ensureApiQuotaTable(p: pg.Pool): Promise<void> {
  await p.query(`
    CREATE TABLE IF NOT EXISTS api_quota_daily (
      day DATE NOT NULL,
      provider TEXT NOT NULL,
      success INT NOT NULL DEFAULT 0,
      failed INT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      PRIMARY KEY (day, provider)
    )
  `);
}

async function ensureWatchColumns(p: pg.Pool): Promise<void> {
  if (!(await tableExists(p, "journeys"))) return;
  if (!(await columnExists(p, "journeys", "watch_always"))) {
    await p.query(
      `ALTER TABLE journeys ADD COLUMN watch_always BOOLEAN NOT NULL DEFAULT false`,
    );
  }
  if (!(await columnExists(p, "journeys", "watch_lead_hours"))) {
    await p.query(
      `ALTER TABLE journeys ADD COLUMN watch_lead_hours INT NOT NULL DEFAULT 4`,
    );
  }
}

async function ensureStationsTable(p: pg.Pool): Promise<void> {
  await p.query(`
    CREATE TABLE IF NOT EXISTS stations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

export async function migrate(): Promise<void> {
  const p = getPool();
  const here = path.dirname(fileURLToPath(import.meta.url));
  const sql = fs.readFileSync(path.join(here, "schema.sql"), "utf8");
  await p.query(sql);
  await migrateLegacyJourneys(p);
  await ensureEventLiaisonColumns(p);
  await ensureApiQuotaTable(p);
  await ensureWatchColumns(p);
  await ensureStationsTable(p);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
