/** Motif best-effort (jamais inventé). */

const REASON_MAX = 280;
const KEY_MAX = 80;

export type DelayReason = {
  delayReason: string | null;
  delayReasonKey: string | null;
};

export const EMPTY_DELAY_REASON: DelayReason = {
  delayReason: null,
  delayReasonKey: null,
};

export function foldReasonKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, KEY_MAX);
}

export function clipReason(raw: string): string {
  return raw.replace(/\s+/g, " ").trim().slice(0, REASON_MAX);
}

export function delayReasonFromParts(input: {
  cause?: string | null;
  category?: string | null;
  message?: string | null;
}): DelayReason {
  const message = clipReason(String(input.message ?? ""));
  const cause = clipReason(String(input.cause ?? ""));
  const category = clipReason(String(input.category ?? ""));
  const delayReason = message || cause || category || null;
  const keySrc = cause || category || message;
  const delayReasonKey = keySrc ? foldReasonKey(keySrc) : null;
  if (!delayReason && !delayReasonKey) return EMPTY_DELAY_REASON;
  return { delayReason, delayReasonKey };
}

export type NavitiaDisruptionLite = {
  id?: string;
  disruption_id?: string;
  cause?: string;
  category?: string;
  messages?: Array<{ text?: string }>;
};

export type NavitiaDepartureLite = {
  links?: Array<{ type?: string; id?: string }>;
};

export function delayReasonFromNavitia(
  dep: NavitiaDepartureLite,
  disruptions: NavitiaDisruptionLite[],
): DelayReason {
  const ids = new Set(
    (dep.links ?? [])
      .filter((l) => l.type === "disruption" && l.id)
      .map((l) => String(l.id)),
  );
  if (ids.size === 0 || disruptions.length === 0) return EMPTY_DELAY_REASON;

  const matched = disruptions.filter(
    (d) =>
      (d.id && ids.has(d.id)) ||
      (d.disruption_id && ids.has(d.disruption_id)),
  );
  if (matched.length === 0) return EMPTY_DELAY_REASON;

  const d = matched[0]!;
  const message = d.messages?.map((m) => m.text ?? "").find((t) => t.trim());
  return delayReasonFromParts({
    cause: d.cause,
    category: d.category,
    message: message ?? null,
  });
}
