import type { BoardTrafficStatus } from "@sncf-alerts/shared";

export function boardClass(status: BoardTrafficStatus): string {
  switch (status) {
    case "on_time":
      return "status-box status-ok";
    case "delayed":
      return "status-box status-delay";
    case "cancelled":
      return "status-box status-cancel";
    case "no_data":
      return "status-box status-nodata";
    case "paused":
      return "status-box status-paused";
    case "outside_window":
      return "status-box status-window";
    default:
      return "status-box";
  }
}

export function ingestClass(status: string | null): string {
  if (status === "ok") return "ingest-banner status-ok";
  if (status === "error") return "ingest-banner status-delay";
  if (status === "skipped") return "ingest-banner status-window";
  return "ingest-banner status-nodata";
}
