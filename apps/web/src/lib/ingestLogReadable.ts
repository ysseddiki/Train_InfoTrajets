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

/** TripUpdates MATCH → signal outil si retard / suppress. */
function readableZouTripMatchLine(line: string): ReadableBullet | null {
  if (/^UIC /i.test(line) || /^0 trip/i.test(line)) {
    return bullet(line, null);
  }
  if (/^0 match/i.test(line)) {
    return bullet(
      line.replace(/^0 match[^\—]*—?\s*/i, "Aucun train correspondant — "),
      null,
    );
  }
  if (!/\bMATCH\b/i.test(line)) return null;

  // Anciennes lignes SA (kind=) — ne plus les traiter comme signal
  if (/\bkind=/i.test(line)) {
    const rest = line
      .replace(/^MATCH\s*/i, "")
      .replace(/kind=\w+\s*·\s*/i, "")
      .replace(/effect=\d+\s*·\s*/i, "")
      .trim();
    return bullet(
      `Ignoré (Service Alert) — ${rest.slice(0, 160)}`,
      "ignored",
    );
  }

  const train = field(line, "train");
  const dir = field(line, "dir");
  const delay = field(line, "delayMin");
  const canceled = /\bCANCELED\b/i.test(line) || /\bSKIPPED\b/i.test(line);
  const parts: string[] = [];
  if (train && train !== "—") parts.push(`Train ${train}`);
  else parts.push("Train");
  if (dir && dir !== "—") parts.push(`vers ${dir}`);

  let highlight: BulletHighlight = "ok";
  if (canceled) {
    parts.push("— supprimé / non desservi");
    highlight = "cancel";
  } else if (delay && delay !== "—" && Number(delay) > 0) {
    parts.push(`— retard ${delay} min`);
    highlight = "delay";
  } else if (delay === "0") {
    parts.push("— à l’heure");
    highlight = "ok";
  } else {
    parts.push("— retard non chiffré");
    highlight = null;
  }

  return bullet(parts.join(" "), highlight);
}

function summarizeZouFeed(entry: IngestApiLogEntry): ReadableLogEntry {
  const entityLine = entry.lines.find(
    (l) => /\d+\s+entité/.test(l) || /\d+\s+alerte/.test(l),
  );
  const sources = entry.lines.find((l) => l.startsWith("sources="));
  const countMatch =
    entityLine?.match(/(\d+)\s+entité/) ??
    entityLine?.match(/(\d+)\s+alerte/) ??
    null;
  const count = countMatch
    ? Number(countMatch[1])
    : Math.max(0, entry.lines.length - 1);
  const isSa = /Service Alerts/i.test(entry.title);
  const sourceLabel = sources
    ? sources.replace(/^sources=/, "").replace(/\s*\+\s*/g, ", ")
    : null;

  const bullets: ReadableBullet[] = [];
  if (!entry.ok) {
    for (const l of entry.lines.slice(0, 5)) bullets.push(bullet(l));
  } else if (isSa) {
    bullets.push(
      bullet(
        `${count} alerte(s) feed — non utilisées comme retard par l’outil.`,
        "ignored",
      ),
    );
    let shown = 0;
    for (const line of entry.lines) {
      const h = field(line, "header");
      if (!h || h === "—") continue;
      bullets.push(bullet(`• ${h.slice(0, 140)}`, "ignored"));
      shown += 1;
      if (shown >= 5) break;
    }
    if (count > shown) {
      bullets.push(
        bullet(`… et ${count - shown} autre(s) (mode Technique).`, "ignored"),
      );
    }
  } else {
    bullets.push(bullet(`${count} mise(s) à jour de trains reçue(s).`));
    if (sourceLabel && sourceLabel !== "—") {
      bullets.push(bullet(`Sources : ${sourceLabel}`));
    }
    let delayed = 0;
    for (const line of entry.lines) {
      if (/\[d=([1-9]\d*)s/.test(line)) delayed += 1;
    }
    if (delayed > 0) {
      bullets.push(
        bullet(
          `Dont au moins ${delayed} stop(s) avec delay>0 s dans le feed (brut).`,
          "delay",
        ),
      );
    }
    bullets.push(
      bullet(
        "Seul le matching UIC (ci-dessous) décide des retards outil.",
        null,
      ),
    );
  }

  return {
    id: entry.id,
    at: entry.at,
    ok: entry.ok,
    httpStatus: entry.httpStatus,
    title: isSa
      ? "Alertes ZOU (ignorées — pas un retard)"
      : "Feed TripUpdates ZOU (brut)",
    bullets,
    hiddenRawLines: Math.max(0, entry.lines.length - bullets.length),
    kind: isSa ? "ignored" : "feed",
    isToolSignal: false,
  };
}

function summarizeMatch(entry: IngestApiLogEntry): ReadableLogEntry {
  const isSa =
    /Service Alerts/i.test(entry.title) && !/TripUpdates/i.test(entry.title);
  const route =
    entry.title
      .replace(/^Match TripUpdates UIC\s*—\s*/i, "")
      .replace(/^Match (TripUpdates|Service Alerts)\s*—\s*/i, "") || entry.title;

  if (isSa) {
    const bullets = entry.lines.map((l) => {
      if (/\bMATCH\b/i.test(l) || /\bSKIP\b/i.test(l)) {
        return bullet(l.slice(0, 200), "ignored");
      }
      return bullet(l.slice(0, 200), "ignored");
    });
    return {
      id: entry.id,
      at: entry.at,
      ok: entry.ok,
      httpStatus: entry.httpStatus,
      title: `Service Alerts (ignorées) — ${route}`,
      bullets:
        bullets.length > 0
          ? bullets.slice(0, 12)
          : [bullet("Aucune SA (et non utilisée pour les retards).", "ignored")],
      hiddenRawLines: 0,
      kind: "ignored",
      isToolSignal: false,
    };
  }

  const bullets = entry.lines
    .map((l) => readableZouTripMatchLine(l))
    .filter((x): x is ReadableBullet => Boolean(x));

  const hasDelay = bullets.some((b) => b.highlight === "delay");
  const hasCancel = bullets.some((b) => b.highlight === "cancel");

  return {
    id: entry.id,
    at: entry.at,
    ok: entry.ok,
    httpStatus: entry.httpStatus,
    title: `Signaux outil (TripUpdates) — ${route}`,
    bullets:
      bullets.length > 0
        ? bullets
        : [bullet("Aucun train OD dans la fenêtre.", null)],
    hiddenRawLines: 0,
    kind: "match",
    isToolSignal: hasDelay || hasCancel || bullets.some((b) => b.highlight === "ok"),
  };
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
  if (entry.source === "zou") {
    if (/Service Alerts/i.test(entry.title) && !/^Match /i.test(entry.title)) {
      return summarizeZouFeed(entry);
    }
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
    bullets: entry.lines.slice(0, 12).map((l) => bullet(l.slice(0, 200))),
    hiddenRawLines: Math.max(0, entry.lines.length - 12),
    kind: "other",
    isToolSignal: false,
  };
}
