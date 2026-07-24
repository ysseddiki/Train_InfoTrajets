import type { AlertDeliveryDto } from "@sncf-alerts/shared";
import { directionLabel, formatWhen } from "../lib/format";
import { StatusChip } from "./StatusChip";

export function DeliveriesTable({
  deliveries,
}: {
  deliveries: AlertDeliveryDto[];
}) {
  if (deliveries.length === 0) {
    return <p className="muted">Aucune livraison pour le moment.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Canal</th>
            <th>Statut</th>
            <th>Sens</th>
            <th>Détail</th>
          </tr>
        </thead>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.id}>
              <td>{formatWhen(d.createdAt)}</td>
              <td>{d.channel}</td>
              <td>
                <StatusChip status={d.status} />
              </td>
              <td>{directionLabel(d.direction)}</td>
              <td className="muted">{d.detail ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
