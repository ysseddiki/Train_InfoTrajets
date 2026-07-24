import type { DisruptionEventDto } from "@sncf-alerts/shared";
import { formatDelayMinutes } from "@sncf-alerts/shared";
import { directionLabel, formatWhen, kindLabel } from "../lib/format";

export function EventsTable({
  events,
  showSource = false,
}: {
  events: DisruptionEventDto[];
  showSource?: boolean;
}) {
  if (events.length === 0) {
    return <p className="muted">Aucun événement pour le moment.</p>;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Détecté</th>
            <th>Sens</th>
            <th>Type</th>
            <th>Titre</th>
            <th>Retard</th>
            {showSource && <th>Source</th>}
          </tr>
        </thead>
        <tbody>
          {events.map((e) => (
            <tr key={e.id}>
              <td>{formatWhen(e.detectedAt)}</td>
              <td>{directionLabel(e.direction)}</td>
              <td>{kindLabel(e.kind)}</td>
              <td>{e.title}</td>
              <td>{formatDelayMinutes(e.delayMinutes, e.kind)}</td>
              {showSource && <td className="muted">{e.source}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
