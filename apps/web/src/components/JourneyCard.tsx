import type { JourneyStatusCard } from "@sncf-alerts/shared";
import { formatDelayMinutes } from "@sncf-alerts/shared";
import { ExternalLink } from "lucide-react";
import { boardClass } from "../lib/boardStatus";
import {
  daysSummary,
  formatRelative,
  formatWhen,
  kindLabel,
} from "../lib/format";

export function JourneyCard({
  title,
  card,
}: {
  title: string;
  card: JourneyStatusCard | null;
}) {
  if (!card) {
    return (
      <article className="journey-card">
        <h2>{title}</h2>
        <p className="muted">Non configuré</p>
      </article>
    );
  }

  const ev = card.latestEvent;
  const gcUrl = card.originDisplayUrl;

  return (
    <article className={`journey-card journey-tone-${card.boardStatus}`}>
      <div className="journey-card-head">
        <h2>{title}</h2>
        <span className={`watch-badge ${card.active ? "watch-on" : "watch-off"}`}>
          {card.active ? "Surveillance ON" : "Pause"}
        </span>
      </div>
      <p className="journey-label">{card.label}</p>
      <p className="journey-od">
        {card.originLabel} → {card.destinationLabel}
        <span className="muted"> · filtre gare desservie</span>
      </p>
      <div className={`${boardClass(card.boardStatus)} board-hero`}>
        <strong>{card.boardStatusLabel}</strong>
      </div>
      {gcUrl ? (
        <p className="gc-link-wrap">
          <a
            className="gc-link"
            href={gcUrl}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={14} aria-hidden />
            Fiche Gares &amp; Connexions
          </a>
        </p>
      ) : null}
      <dl className="meta-list">
        <div>
          <dt>Fenêtre trajet</dt>
          <dd>
            {card.timeWindow.start}–{card.timeWindow.end} ·{" "}
            {daysSummary(card.daysOfWeek)}
          </dd>
        </div>
        <div>
          <dt>Veille</dt>
          <dd>
            {card.watchAlways
              ? "Continue"
              : card.watchLeadHours === 0
                ? "Dès le début trajet"
                : `${card.watchLeadHours} h avant`}
          </dd>
        </div>
        <div>
          <dt>Réseau</dt>
          <dd>{card.network}</dd>
        </div>
        <div>
          <dt>Seuil retard</dt>
          <dd>{card.minDelayMinutes} min</dd>
        </div>
      </dl>
      <h3 className="section-sub">Dernier événement</h3>
      {ev ? (
        <div className="journey-event">
          <span className="pill">{kindLabel(ev.kind)}</span>
          {(ev.kind === "delay" || ev.delayMinutes != null) && (
            <span className="pill pill-warn">
              {formatDelayMinutes(ev.delayMinutes, ev.kind)}
            </span>
          )}
          <p>{ev.title}</p>
          <p className="muted">
            {formatWhen(ev.detectedAt)} · {formatRelative(ev.detectedAt)}
          </p>
        </div>
      ) : (
        <p className="muted journey-event-empty">Aucun événement enregistré</p>
      )}
    </article>
  );
}
