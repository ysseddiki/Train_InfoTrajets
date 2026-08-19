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
  if (!(await columnExists(p, "journeys", "notify_step_minutes"))) {
    await p.query(
      `ALTER TABLE journeys ADD COLUMN notify_step_minutes INT NOT NULL DEFAULT 5`,
    );
  }
}

async function ensureDelayReasonColumns(p: pg.Pool): Promise<void> {
  if (!(await tableExists(p, "disruption_events"))) return;
  if (!(await columnExists(p, "disruption_events", "delay_reason"))) {
    await p.query(`ALTER TABLE disruption_events ADD COLUMN delay_reason TEXT`);
  }
  if (!(await columnExists(p, "disruption_events", "delay_reason_key"))) {
    await p.query(
      `ALTER TABLE disruption_events ADD COLUMN delay_reason_key TEXT`,
    );
  }
  const addedNotifiedDelay = !(await columnExists(
    p,
    "disruption_events",
    "notified_delay_minutes",
  ));
  if (addedNotifiedDelay) {
    await p.query(
      `ALTER TABLE disruption_events ADD COLUMN notified_delay_minutes INT`,
    );
  }
  if (!(await columnExists(p, "disruption_events", "notified_severity"))) {
    await p.query(
      `ALTER TABLE disruption_events ADD COLUMN notified_severity TEXT`,
    );
  }
  if (addedNotifiedDelay) {
    await p.query(
      `UPDATE disruption_events
       SET notified_delay_minutes = delay_minutes, notified_severity = severity
       WHERE notified_delay_minutes IS NULL`,
    );
  }
}

async function ensureStationsTable(p: pg.Pool): Promise<void> {
  await p.query(`
    CREATE TABLE IF NOT EXISTS stations (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      external_id TEXT NOT NULL UNIQUE,
      label TEXT NOT NULL,
      display_url TEXT,
      terminus_helpers_enabled BOOLEAN NOT NULL DEFAULT false,
      terminus_helper_labels TEXT[] NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  if (!(await columnExists(p, "stations", "display_url"))) {
    await p.query(`ALTER TABLE stations ADD COLUMN display_url TEXT`);
  }
  if (await columnExists(p, "stations", "terminus_aliases")) {
    await p.query(`ALTER TABLE stations DROP COLUMN terminus_aliases`);
  }
  if (!(await columnExists(p, "stations", "terminus_helpers_enabled"))) {
    await p.query(
      `ALTER TABLE stations ADD COLUMN terminus_helpers_enabled BOOLEAN NOT NULL DEFAULT false`,
    );
  }
  if (!(await columnExists(p, "stations", "terminus_helper_labels"))) {
    await p.query(
      `ALTER TABLE stations ADD COLUMN terminus_helper_labels TEXT[] NOT NULL DEFAULT '{}'`,
    );
  }
}

async function ensureLiaisonDefaultColumn(p: pg.Pool): Promise<void> {
  if (!(await tableExists(p, "liaisons"))) return;
  if (!(await columnExists(p, "liaisons", "is_default"))) {
    await p.query(
      `ALTER TABLE liaisons ADD COLUMN is_default BOOLEAN NOT NULL DEFAULT false`,
    );
  }
  // Au plus une default ; si aucune, marquer la plus ancienne
  const defaults = await p.query(
    `SELECT COUNT(*)::int AS n FROM liaisons WHERE is_default = true`,
  );
  if (Number(defaults.rows[0]?.n ?? 0) === 0) {
    await p.query(`
      UPDATE liaisons SET is_default = true
      WHERE id = (SELECT id FROM liaisons ORDER BY updated_at ASC LIMIT 1)
    `);
  } else if (Number(defaults.rows[0]?.n ?? 0) > 1) {
    await p.query(`
      UPDATE liaisons SET is_default = false
      WHERE id NOT IN (
        SELECT id FROM liaisons WHERE is_default = true
        ORDER BY updated_at ASC LIMIT 1
      )
    `);
  }
}

async function ensureDeliveryLiaisonColumn(p: pg.Pool): Promise<void> {
  if (!(await tableExists(p, "alert_deliveries"))) return;
  if (!(await columnExists(p, "alert_deliveries", "liaison_id"))) {
    await p.query(`ALTER TABLE alert_deliveries ADD COLUMN liaison_id UUID`);
  }
  await p.query(`
    UPDATE alert_deliveries d
    SET liaison_id = e.liaison_id
    FROM disruption_events e
    WHERE d.event_id = e.id
      AND d.liaison_id IS NULL
      AND e.liaison_id IS NOT NULL
  `);
}

async function ensureWeatherColumns(p: pg.Pool): Promise<void> {
  if (!(await tableExists(p, "stations"))) return;
  if (!(await columnExists(p, "stations", "latitude"))) {
    await p.query(`ALTER TABLE stations ADD COLUMN latitude DOUBLE PRECISION`);
  }
  if (!(await columnExists(p, "stations", "longitude"))) {
    await p.query(`ALTER TABLE stations ADD COLUMN longitude DOUBLE PRECISION`);
  }
  if (!(await tableExists(p, "disruption_events"))) return;
  if (!(await columnExists(p, "disruption_events", "weather_bucket"))) {
    await p.query(
      `ALTER TABLE disruption_events ADD COLUMN weather_bucket TEXT`,
    );
  }
  if (!(await columnExists(p, "disruption_events", "weather_code"))) {
    await p.query(`ALTER TABLE disruption_events ADD COLUMN weather_code INT`);
  }
  if (!(await columnExists(p, "disruption_events", "weather_label"))) {
    await p.query(
      `ALTER TABLE disruption_events ADD COLUMN weather_label TEXT`,
    );
  }
  if (!(await columnExists(p, "disruption_events", "precipitation_mm"))) {
    await p.query(
      `ALTER TABLE disruption_events ADD COLUMN precipitation_mm REAL`,
    );
  }
  if (!(await columnExists(p, "disruption_events", "wind_speed_kmh"))) {
    await p.query(
      `ALTER TABLE disruption_events ADD COLUMN wind_speed_kmh REAL`,
    );
  }
  if (!(await columnExists(p, "disruption_events", "temperature_c"))) {
    await p.query(
      `ALTER TABLE disruption_events ADD COLUMN temperature_c REAL`,
    );
  }
}

async function ensureUserAccessColumns(p: pg.Pool): Promise<void> {
  if (!(await tableExists(p, "admin_accounts"))) return;
  if (!(await columnExists(p, "admin_accounts", "role"))) {
    await p.query(`
      ALTER TABLE admin_accounts
      ADD COLUMN role TEXT NOT NULL DEFAULT 'admin'
      CHECK (role IN ('reader', 'liaison_editor', 'admin'))
    `);
  }
  if (!(await columnExists(p, "admin_accounts", "disabled_at"))) {
    await p.query(
      `ALTER TABLE admin_accounts ADD COLUMN disabled_at TIMESTAMPTZ`,
    );
  }
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
  await ensureDelayReasonColumns(p);
  await ensureStationsTable(p);
  await ensureWeatherColumns(p);
  await ensureLiaisonDefaultColumn(p);
  await ensureDeliveryLiaisonColumn(p);
  await ensureUserAccessColumns(p);
  await p.query(`
    CREATE TABLE IF NOT EXISTS notify_jobs (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      event_id UUID NOT NULL REFERENCES disruption_events(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'done', 'failed')),
      attempts INT NOT NULL DEFAULT 0,
      last_error TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      processed_at TIMESTAMPTZ
    )
  `);
  if (!(await columnExists(p, "notify_jobs", "force"))) {
    await p.query(
      `ALTER TABLE notify_jobs ADD COLUMN force BOOLEAN NOT NULL DEFAULT false`,
    );
  }
  await p.query(`
    CREATE INDEX IF NOT EXISTS notify_jobs_pending_idx
      ON notify_jobs (created_at)
      WHERE status = 'pending'
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS journey_board_snapshots (
      journey_id UUID PRIMARY KEY REFERENCES journeys(id) ON DELETE CASCADE,
      train_number TEXT,
      scheduled_at TIMESTAMPTZ,
      realtime_at TIMESTAMPTZ,
      delay_minutes INT,
      cancelled BOOLEAN NOT NULL DEFAULT false,
      status TEXT NOT NULL,
      status_label TEXT NOT NULL,
      source TEXT NOT NULL,
      fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await p.query(`
    CREATE TABLE IF NOT EXISTS board_day_observations (
      day DATE NOT NULL,
      liaison_id UUID NOT NULL REFERENCES liaisons(id) ON DELETE CASCADE,
      PRIMARY KEY (day, liaison_id)
    )
  `);
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
