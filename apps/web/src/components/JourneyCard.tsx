import type { JourneyStatusCard } from "@sncf-alerts/shared";
import { DEFAULT_WATCH_LAG_HOURS, formatDelayMinutes } from "@sncf-alerts/shared";
import { ExternalLink } from "lucide-react";
import { boardClass } from "../lib/boardStatus";
import {
  daysSummary,
  formatRelative,
  formatTrainNumber,
  formatWhen,
  kindLabel,
} from "../lib/format";

function nextDepartureBlock(card: JourneyStatusCard) {
  const n = card.nextDeparture;
  if (!n) {
    return (
      <p className="muted next-train-empty">Prochain train : pas encore de poll</p>
    );
  }

  const timeDisplay =
    n.realtimeTime && n.scheduledTime && n.realtimeTime !== n.scheduledTime
      ? `${n.realtimeTime} · théo ${n.scheduledTime}`
      : (n.realtimeTime ?? n.scheduledTime ?? "—");

  return (
    <div className={`next-train next-train-${n.status}`}>
      <p className="next-train-kicker">Prochain train</p>
      <div className="next-train-row">
        <span className="next-train-num">
          {n.trainNumber ? `N° ${n.trainNumber}` : "N° —"}
        </span>
        <span className="next-train-time">{timeDisplay}</span>
      </div>
      <p className="next-train-status">{n.statusLabel}</p>
    </div>
  );
}

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
      <p className="journey-label">
        {card.originLabel} → {card.destinationLabel}
      </p>
      <div className={`${boardClass(card.boardStatus)} board-hero`}>
        <strong>{card.boardStatusLabel}</strong>
      </div>
      {nextDepartureBlock(card)}
      {card.originWeather?.weatherLabel ? (
        <p className="journey-weather muted">
          Météo gare ·{" "}
          <strong>{card.originWeather.weatherLabel.split(" (WMO")[0]}</strong>
          {card.originWeather.temperatureC != null
            ? ` · ${card.originWeather.temperatureC} °C`
            : null}
          {card.originWeather.precipitationMm != null &&
          card.originWeather.precipitationMm > 0
            ? ` · ${card.originWeather.precipitationMm} mm/h`
            : null}
          {card.originWeather.windSpeedKmh != null
            ? ` · vent ${card.originWeather.windSpeedKmh} km/h`
            : null}
        </p>
      ) : null}
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
                ? `Dès le début trajet · ${DEFAULT_WATCH_LAG_HOURS} h après`
                : `${card.watchLeadHours} h avant · ${DEFAULT_WATCH_LAG_HOURS} h après`}
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
        <div>
          <dt>Palier notif</dt>
          <dd>
            {card.notifyStepMinutes === 0
              ? "Désactivé"
              : `${card.notifyStepMinutes} min`}
          </dd>
        </div>
      </dl>
      <h3 className="section-sub">Dernier événement</h3>
      {ev ? (
        <div className="journey-event">
          <span className="pill">{kindLabel(ev.kind)}</span>
          {ev.trainNumber ? (
            <span className="pill pill-muted">
              {formatTrainNumber(ev.trainNumber)}
            </span>
          ) : null}
          {(ev.kind === "delay" || ev.delayMinutes != null) && (
            <span className="pill pill-warn">
              {formatDelayMinutes(ev.delayMinutes, ev.kind)}
            </span>
          )}
          <p>{ev.title}</p>
          {ev.delayReason ? (
            <p className="muted">Motif : {ev.delayReason}</p>
          ) : null}
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
