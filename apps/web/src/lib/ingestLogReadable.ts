import type { IngestApiLogEntry } from "@sncf-alerts/shared";

export type LogViewMode = "readable" | "raw";

/** Mise en avant : info réellement utilisée comme retard / suppression outil. */
export type BulletHighlight = "delay" | "cancel" | "ok" | "ignored" | null;

export type ReadableBullet = {
  text: string;
  highlight: BulletHighlight;
};

export type ReadableLogEntry = {
  id: string;
  at: string;
  ok: boolean;
  httpStatus: number | null;
  /** Titre court en français */
  title: string;
  bullets: ReadableBullet[];
  /** Nombre de lignes techniques masquées */
  hiddenRawLines: number;
  /** Catégorie pour style éventuel */
  kind: "feed" | "match" | "probe" | "other" | "ignored";
  /** Entrée entière = signal métier retard (TripUpdates match) */
  isToolSignal: boolean;
};

function field(line: string, key: string): string | null {
  const re = new RegExp(`(?:^|·\\s*|\\s)${key}=([^·]+)`);
  const m = line.match(re);
  return m?.[1]?.trim() || null;
}

function navitiaTime(raw: string | null): string | null {
  if (!raw || raw === "—") return null;
  const m = raw.match(/T(\d{2})(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  return raw;
}

function bullet(text: string, highlight: BulletHighlight = null): ReadableBullet {
  return { text, highlight };
}

function readableNavitiaLine(line: string): ReadableBullet | null {
  if (/^0 départ/.test(line)) {
    return bullet("Aucun départ reçu pour cette gare.");
  }
  const train = field(line, "train");
  const dir = field(line, "dir");
  const base = navitiaTime(field(line, "base"));
  const real = navitiaTime(field(line, "real"));
  const mode = field(line, "mode");
  if (!train && !dir) {
    return line.length < 120 ? bullet(line) : null;
  }

  const parts: string[] = [];
  if (train && train !== "—") parts.push(`Train ${train}`);
  if (mode) parts.push(`(${mode})`);
  if (dir && dir !== "—") parts.push(`→ ${dir}`);
  if (base && real && base !== real) {
    parts.push(`· prévu ${base}, réel ${real}`);
  } else if (base || real) {
    parts.push(`· ${real ?? base}`);
  }
  const text = parts.join(" ") || null;
  if (!text) return null;

  // Écart horaire visible = signal potentiel côté Navitia
  if (base && real && base !== real) {
    return bullet(text, "delay");
  }
  return bullet(text, "ok");
}

function summarizeNavitia(entry: IngestApiLogEntry): ReadableLogEntry {
  const cache = /\(cache\)/i.test(entry.title);
  const title = entry.title
    .replace(
      /^Départs\s*(\(cache\))?\s*—\s*/i,
      cache ? "Départs (cache) — " : "Départs — ",
    )
    .replace(/^Probe\s+/i, "Test API — ");

  if (/^Probe/i.test(entry.title)) {
    return {
      id: entry.id,
      at: entry.at,
      ok: entry.ok,
      httpStatus: entry.httpStatus,
      title: "Test de connexion Navitia",
      bullets: entry.lines.slice(0, 3).map((l) => bullet(l.slice(0, 200))),
      hiddenRawLines: Math.max(0, entry.lines.length - 3),
      kind: "probe",
      isToolSignal: false,
    };
  }

  const bullets = entry.lines
    .map((l) => readableNavitiaLine(l))
    .filter((x): x is ReadableBullet => Boolean(x));

  return {
    id: entry.id,
    at: entry.at,
    ok: entry.ok,
    httpStatus: entry.httpStatus,
    title,
    bullets:
      bullets.length > 0
        ? bullets
        : entry.ok
          ? [bullet("Réponse reçue (voir mode Technique pour le détail).")]
          : entry.lines.slice(0, 5).map((l) => bullet(l)),
    hiddenRawLines: Math.max(0, entry.lines.length - bullets.length),
    kind: "other",
    isToolSignal: bullets.some((b) => b.highlight === "delay"),
  };
}

function summarizeStub(entry: IngestApiLogEntry): ReadableLogEntry {
  const isInject = /Injection/i.test(entry.title);
  return {
    id: entry.id,
    at: entry.at,
    ok: entry.ok,
    httpStatus: entry.httpStatus,
    title: entry.title
      .replace(/^Injection debug/, "Injection stub")
      .replace(/^Historique stub/, "Historique stub")
      .replace(/^Poll stub/, "Poll stub")
      .replace(/^Probe stub/, "Test stub"),
    bullets: entry.lines.map((l) => {
      const [k, ...rest] = l.split("=");
      if (rest.length === 0) return bullet(l, isInject ? "delay" : null);
      const v = rest.join("=");
      const labels: Record<string, string> = {
        created: "Créé",
        externalEventId: "Id événement",
        journeyId: "Trajet",
        liaisonId: "Liaison",
        kind: "Type",
        delayMinutes: "Retard (min)",
        title: "Titre",
        description: "Description",
        months: "Mois",
        legs: "Sens",
        openJourneys: "Sens en fenêtre",
      };
      const hl: BulletHighlight =
        k === "delayMinutes" || k === "kind" ? "delay" : isInject ? "delay" : null;
      return bullet(`${labels[k ?? ""] ?? k} : ${v}`, hl);
    }),
    hiddenRawLines: 0,
    kind: "other",
    isToolSignal: isInject,
  };
}

/** Ligne technique : signal retard utilisé par l’outil ? */
export function rawLineHighlight(line: string): BulletHighlight {
  if (/\bSKIP\b/i.test(line) && /effect=/i.test(line)) return "ignored";
  if (/\bkind=/i.test(line) && /\bMATCH\b/i.test(line)) return "ignored";
  if (/\bCANCELED\b/i.test(line) || /\bSKIPPED\b/i.test(line)) return "cancel";
  const delayMin = field(line, "delayMin");
  if (delayMin && delayMin !== "—" && Number(delayMin) > 0) return "delay";
  const dSec = line.match(/\[d=([1-9]\d*)s/);
  if (dSec) return "delay";
  return null;
}

/** Transforme une entrée technique en vue lecture. */
export function toReadableLogEntry(entry: IngestApiLogEntry): ReadableLogEntry {
  if (entry.source === "navitia") return summarizeNavitia(entry);
  if (entry.source === "stub") return summarizeStub(entry);

  return {
    id: entry.id,
    at: entry.at,
    ok: entry.ok,
    httpStatus: entry.httpStatus,
    title: entry.title,
    bullets: entry.lines.slice(0, 12).map((l) => bullet(l.slice(0, 200))),
    hiddenRawLines: Math.max(0, entry.lines.length - 12),
    kind: "other",
    isToolSignal: false,
  };
}
