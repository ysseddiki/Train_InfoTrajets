import type { IngestApiLogEntry } from "@sncf-alerts/shared";

export type LogViewMode = "readable" | "raw";

export type ReadableLogEntry = {
  id: string;
  at: string;
  ok: boolean;
  httpStatus: number | null;
  /** Titre court en français */
  title: string;
  /** Phrases / puces lisibles (pas le dump technique) */
  bullets: string[];
  /** Nombre de lignes techniques masquées */
  hiddenRawLines: number;
  /** Catégorie pour style éventuel */
  kind: "feed" | "match" | "probe" | "other";
};

function field(line: string, key: string): string | null {
  const re = new RegExp(`(?:^|·\\s*|\\s)${key}=([^·]+)`);
  const m = line.match(re);
  return m?.[1]?.trim() || null;
}

function navitiaTime(raw: string | null): string | null {
  if (!raw || raw === "—") return null;
  // Navitia local: 20260725T163000
  const m = raw.match(/T(\d{2})(\d{2})/);
  if (m) return `${m[1]}:${m[2]}`;
  return raw;
}

function readableNavitiaLine(line: string): string | null {
  if (/^0 départ/.test(line)) return "Aucun départ reçu pour cette gare.";
  const train = field(line, "train");
  const dir = field(line, "dir");
  const base = navitiaTime(field(line, "base"));
  const real = navitiaTime(field(line, "real"));
  const mode = field(line, "mode");
  if (!train && !dir) return line.length < 120 ? line : null;

  const parts: string[] = [];
  if (train && train !== "—") parts.push(`Train ${train}`);
  if (mode) parts.push(`(${mode})`);
  if (dir && dir !== "—") parts.push(`→ ${dir}`);
  if (base && real && base !== real) {
    parts.push(`· prévu ${base}, réel ${real}`);
  } else if (base || real) {
    parts.push(`· ${real ?? base}`);
  }
  return parts.join(" ") || null;
}

function readableZouMatchLine(line: string): string | null {
  if (/^0 match/i.test(line) || /^0 alerte/i.test(line)) {
    return line.replace(/^0 match[^\—]*—?\s*/i, "Aucun train correspondant — ")
      .replace(/^0 alerte matchée.*/i, "Aucune alerte pertinente pour ce trajet.");
  }
  if (!line.includes("MATCH")) return null;

  if (line.includes("kind=")) {
    const kind = field(line, "kind") ?? "delay";
    const rest = line
      .replace(/^MATCH\s*/i, "")
      .replace(/kind=\w+\s*·\s*/, "")
      .trim();
    const label = kind === "cancellation" ? "Suppression / interruption" : "Perturbation";
    return `${label} — ${rest.slice(0, 180)}`;
  }

  const train = field(line, "train");
  const dir = field(line, "dir");
  const delay = field(line, "delayMin");
  const canceled = /\bCANCELED\b/i.test(line) || /\bSKIPPED\b/i.test(line);
  const parts: string[] = [];
  if (train && train !== "—") parts.push(`Train ${train}`);
  else parts.push("Train");
  if (dir && dir !== "—") parts.push(`vers ${dir}`);
  if (canceled) parts.push("— supprimé / non desservi");
  else if (delay && delay !== "—" && delay !== "0") {
    parts.push(`— retard ${delay} min`);
  } else if (delay === "0") {
    parts.push("— à l’heure");
  }
  return parts.join(" ");
}

function summarizeZouFeed(entry: IngestApiLogEntry): ReadableLogEntry {
  const entityLine = entry.lines.find((l) => /\d+\s+entité/.test(l) || /\d+\s+alerte/.test(l));
  const sources = entry.lines.find((l) => l.startsWith("sources="));
  const countMatch =
    entityLine?.match(/(\d+)\s+entité/) ??
    entityLine?.match(/(\d+)\s+alerte/) ??
    null;
  const count = countMatch ? Number(countMatch[1]) : Math.max(0, entry.lines.length - 1);
  const isSa = /Service Alerts/i.test(entry.title);
  const sourceLabel = sources
    ? sources.replace(/^sources=/, "").replace(/\s*\+\s*/g, ", ")
    : null;

  const bullets: string[] = [];
  if (!entry.ok) {
    bullets.push(...entry.lines.slice(0, 5));
  } else if (isSa) {
    bullets.push(`${count} alerte(s) reçue(s) du feed Région Sud.`);
    // Premiers titres d’alertes (header=…)
    let shown = 0;
    for (const line of entry.lines) {
      const h = field(line, "header");
      if (!h || h === "—") continue;
      bullets.push(`• ${h.slice(0, 140)}`);
      shown += 1;
      if (shown >= 5) break;
    }
    if (count > shown) {
      bullets.push(`… et ${count - shown} autre(s) (voir mode Technique).`);
    }
  } else {
    bullets.push(`${count} mise(s) à jour de trains reçue(s).`);
    if (sourceLabel && sourceLabel !== "—") {
      bullets.push(`Sources : ${sourceLabel}`);
    }
    // Compter retards grossiers dans le dump
    let delayed = 0;
    for (const line of entry.lines) {
      if (/\[d=([1-9]\d*)s/.test(line)) delayed += 1;
    }
    if (delayed > 0) {
      bullets.push(`Dont au moins ${delayed} trajet(s) avec un retard signalé.`);
    }
    bullets.push("Détail stop par stop disponible en mode Technique.");
  }

  return {
    id: entry.id,
    at: entry.at,
    ok: entry.ok,
    httpStatus: entry.httpStatus,
    title: isSa
      ? "Alertes trafic ZOU (feed)"
      : "Temps réel ZOU (feed trains)",
    bullets,
    hiddenRawLines: Math.max(0, entry.lines.length - bullets.length),
    kind: "feed",
  };
}

function summarizeMatch(entry: IngestApiLogEntry): ReadableLogEntry {
  const isSa = /Service Alerts/i.test(entry.title);
  const route =
    entry.title.replace(/^Match (TripUpdates|Service Alerts)\s*—\s*/i, "") ||
    entry.title;
  const bullets = entry.lines
    .map((l) => readableZouMatchLine(l))
    .filter((x): x is string => Boolean(x));

  return {
    id: entry.id,
    at: entry.at,
    ok: entry.ok,
    httpStatus: entry.httpStatus,
    title: isSa
      ? `Alertes retenues — ${route}`
      : `Trains retenus — ${route}`,
    bullets:
      bullets.length > 0
        ? bullets
        : ["Rien à signaler pour ce trajet."],
    hiddenRawLines: 0,
    kind: "match",
  };
}

function summarizeNavitia(entry: IngestApiLogEntry): ReadableLogEntry {
  const cache = /\(cache\)/i.test(entry.title);
  const title = entry.title
    .replace(/^Départs\s*(\(cache\))?\s*—\s*/i, cache ? "Départs (cache) — " : "Départs — ")
    .replace(/^Probe\s+/i, "Test API — ");

  if (/^Probe/i.test(entry.title)) {
    return {
      id: entry.id,
      at: entry.at,
      ok: entry.ok,
      httpStatus: entry.httpStatus,
      title: "Test de connexion Navitia",
      bullets: entry.lines.slice(0, 3).map((l) => l.slice(0, 200)),
      hiddenRawLines: Math.max(0, entry.lines.length - 3),
      kind: "probe",
    };
  }

  const bullets = entry.lines
    .map((l) => readableNavitiaLine(l))
    .filter((x): x is string => Boolean(x));

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
          ? ["Réponse reçue (voir mode Technique pour le détail)."]
          : entry.lines.slice(0, 5),
    hiddenRawLines: Math.max(0, entry.lines.length - bullets.length),
    kind: "other",
  };
}

function summarizeStub(entry: IngestApiLogEntry): ReadableLogEntry {
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
      if (rest.length === 0) return l;
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
      return `${labels[k ?? ""] ?? k} : ${v}`;
    }),
    hiddenRawLines: 0,
    kind: "other",
  };
}

/** Transforme une entrée technique en vue lecture. */
export function toReadableLogEntry(entry: IngestApiLogEntry): ReadableLogEntry {
  if (entry.source === "zou") {
    if (/feed brut/i.test(entry.title)) return summarizeZouFeed(entry);
    if (/^Match /i.test(entry.title)) return summarizeMatch(entry);
  }
  if (entry.source === "navitia") return summarizeNavitia(entry);
  if (entry.source === "stub") return summarizeStub(entry);

  return {
    id: entry.id,
    at: entry.at,
    ok: entry.ok,
    httpStatus: entry.httpStatus,
    title: entry.title,
    bullets: entry.lines.slice(0, 12),
    hiddenRawLines: Math.max(0, entry.lines.length - 12),
    kind: "other",
  };
}
