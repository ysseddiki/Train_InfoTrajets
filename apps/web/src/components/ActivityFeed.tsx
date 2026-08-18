import type { AlertDeliveryDto, DisruptionEventDto } from "@sncf-alerts/shared";
import { formatDelayMinutes } from "@sncf-alerts/shared";
import {
  directionLabel,
  formatRelative,
  kindLabel,
} from "../lib/format";
import { StatusChip } from "./StatusChip";

export function EventsActivityFeed({
  events,
}: {
  events: DisruptionEventDto[];
}) {
  if (events.length === 0) {
    return <p className="muted">Aucun événement pour le moment.</p>;
  }

  return (
    <ul className="activity-feed">
      {events.map((e) => (
        <li key={e.id} className="activity-feed-item">
          <div className="activity-feed-main">
            <div className="activity-feed-tags">
              <span className="pill">{kindLabel(e.kind)}</span>
              <span className="pill pill-muted">{directionLabel(e.direction)}</span>
              {(e.kind === "delay" || e.delayMinutes != null) && (
                <span className="pill pill-warn">
                  {formatDelayMinutes(e.delayMinutes, e.kind)}
                </span>
              )}
            </div>
            <p className="activity-feed-title">{e.title}</p>
            {e.delayReason ? (
              <p className="muted activity-feed-reason">Motif : {e.delayReason}</p>
            ) : null}
          </div>
          <time className="activity-feed-time" dateTime={e.detectedAt}>
            {formatRelative(e.detectedAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}

export function DeliveriesActivityFeed({
  deliveries,
}: {
  deliveries: AlertDeliveryDto[];
}) {
  if (deliveries.length === 0) {
    return <p className="muted">Aucune livraison pour le moment.</p>;
  }

  return (
    <ul className="activity-feed">
      {deliveries.map((d) => (
        <li key={d.id} className="activity-feed-item">
          <div className="activity-feed-main">
            <div className="activity-feed-tags">
              <StatusChip status={d.status} />
              <span className="pill pill-muted">{d.channel}</span>
              <span className="pill pill-muted">
                {directionLabel(d.direction)}
              </span>
            </div>
            <p className="activity-feed-title muted">
              {d.detail?.trim() || "Livraison notification"}
            </p>
          </div>
          <time className="activity-feed-time" dateTime={d.createdAt}>
            {formatRelative(d.createdAt)}
          </time>
        </li>
      ))}
    </ul>
  );
}
