import type { DisruptionKind, DisruptionSeverity } from "@sncf-alerts/shared";

const SEVERITY_RANK: Record<DisruptionSeverity, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function shouldNotifyDelayStep(input: {
  created: boolean;
  notifyStepMinutes: number;
  kind: DisruptionKind;
  previousKind?: DisruptionKind | null;
  delayMinutes: number | null;
  notifiedDelayMinutes: number | null;
  severity: DisruptionSeverity;
  notifiedSeverity: DisruptionSeverity | null;
}): boolean {
  if (input.created) return true;

  const prevKind = input.previousKind ?? null;
  if (input.kind === "cancellation" && prevKind !== "cancellation") {
    return true;
  }

  const prevRank = input.notifiedSeverity
    ? SEVERITY_RANK[input.notifiedSeverity]
    : -1;
  if (SEVERITY_RANK[input.severity] > prevRank) return true;

  const step = input.notifyStepMinutes;
  if (step <= 0) return false;

  const next = input.delayMinutes;
  if (next == null) return false;
  const prev = input.notifiedDelayMinutes;
  if (prev == null) {
    // Ancien événement : 1re re-évaluation = palier depuis 0 uniquement si jamais notifié
    return next >= step;
  }
  return next >= prev + step;
}
