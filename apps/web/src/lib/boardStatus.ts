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
