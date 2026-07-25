/**
 * Ring buffer in-process des réponses API ingest (debug admin).
 * Jamais de tokens / Authorization.
 */

export type IngestApiLogSource = "navitia" | "zou" | "stub";

export type IngestApiLogEntry = {
  id: string;
  at: string;
  source: IngestApiLogSource;
  title: string;
  httpStatus: number | null;
  ok: boolean;
  /** Une ligne = un élément reçu ou une info de contexte */
  lines: string[];
};

const MAX_PER_SOURCE = 80;

const buffers: Record<IngestApiLogSource, IngestApiLogEntry[]> = {
  navitia: [],
  zou: [],
  stub: [],
};

let seq = 0;

export function appendIngestApiLog(input: {
  source: IngestApiLogSource;
  title: string;
  httpStatus?: number | null;
  ok?: boolean;
  lines: string[];
}): IngestApiLogEntry {
  const entry: IngestApiLogEntry = {
    id: `log-${Date.now()}-${++seq}`,
    at: new Date().toISOString(),
    source: input.source,
    title: input.title.slice(0, 300),
    httpStatus: input.httpStatus ?? null,
    ok: input.ok !== false,
    lines: input.lines.map((l) => String(l).slice(0, 2000)).slice(0, 500),
  };
  const buf = buffers[input.source];
  buf.unshift(entry);
  if (buf.length > MAX_PER_SOURCE) {
    buf.length = MAX_PER_SOURCE;
  }
  return entry;
}

export function listIngestApiLogs(
  source?: IngestApiLogSource | null,
): IngestApiLogEntry[] {
  if (source && source in buffers) {
    return [...buffers[source]];
  }
  return (["navitia", "zou", "stub"] as const).flatMap((s) => [
    ...buffers[s],
  ]);
}

export function clearIngestApiLogs(source?: IngestApiLogSource | null): number {
  if (source && source in buffers) {
    const n = buffers[source].length;
    buffers[source] = [];
    return n;
  }
  let n = 0;
  for (const s of Object.keys(buffers) as IngestApiLogSource[]) {
    n += buffers[s].length;
    buffers[s] = [];
  }
  return n;
}

export function isIngestApiLogSource(v: unknown): v is IngestApiLogSource {
  return v === "navitia" || v === "zou" || v === "stub";
}
