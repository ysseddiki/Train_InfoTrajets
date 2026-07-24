import type { DeliveryStatus } from "@sncf-alerts/shared";

export function StatusChip({ status }: { status: DeliveryStatus | string }) {
  return <span className={`status-chip status-${status}`}>{status}</span>;
}
