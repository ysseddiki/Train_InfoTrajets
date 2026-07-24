import type { JourneyDirection } from "@sncf-alerts/shared";

const DAY_LABELS = ["", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function formatWhen(iso: string | null): string {
  if (!iso) return "jamais";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
    });
  } catch {
    return iso;
  }
}

export function formatRelative(iso: string | null): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return iso;
  const diffMin = Math.round((Date.now() - t) / 60_000);
  if (diffMin < 1) return "à l’instant";
  if (diffMin < 60) return `il y a ${diffMin} min`;
  const diffH = Math.round(diffMin / 60);
  if (diffH < 48) return `il y a ${diffH} h`;
  const diffD = Math.round(diffH / 24);
  return `il y a ${diffD} j`;
}

export function kindLabel(kind: string): string {
  switch (kind) {
    case "delay":
      return "Retard";
    case "cancellation":
      return "Suppression";
    case "platform_change":
      return "Quai";
    case "disruption":
      return "Perturbation";
    default:
      return kind;
  }
}

export function directionLabel(d: JourneyDirection | null | undefined): string {
  if (d === "outbound") return "Aller";
  if (d === "inbound") return "Retour";
  return "—";
}

export function daysSummary(days: number[]): string {
  if (days.length === 0) return "—";
  if (days.length === 5 && [1, 2, 3, 4, 5].every((d) => days.includes(d))) {
    return "Lun–Ven";
  }
  if (days.length === 7) return "Tous les jours";
  return days.map((d) => DAY_LABELS[d] ?? d).join(", ");
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
