import type { LiaisonConfig } from "@sncf-alerts/shared";
import { defaultLiaisonName } from "@sncf-alerts/shared";
import { useState, type FormEvent } from "react";
import { apiSend } from "../api/client";

const WEEKDAYS = [1, 2, 3, 4, 5] as const;
const WEEKEND = [6, 7] as const;
const NETWORK_TER = "ter";

export function flagsFromDays(days: number[]): {
  weekdays: boolean;
  weekend: boolean;
} {
  const set = new Set(days);
  return {
    weekdays: WEEKDAYS.every((d) => set.has(d)),
    weekend: WEEKEND.every((d) => set.has(d)),
  };
}

export function daysFromFlags(weekdays: boolean, weekend: boolean): number[] {
  const days: number[] = [];
  if (weekdays) days.push(...WEEKDAYS);
  if (weekend) days.push(...WEEKEND);
  return days;
}

type StationFields = { id: string; label: string };

function legPayload(
  stationOrigin: StationFields,
  stationDest: StationFields,
  direction: "outbound" | "inbound",
  daysOfWeek: number[],
  timeWindow: { start: string; end: string },
  minDelayMinutes: number,
  active: boolean,
) {
  const a = stationOrigin;
  const b = stationDest;
  return {
    label:
      direction === "outbound"
        ? `Aller — ${a.label} → ${b.label}`
        : `Retour — ${a.label} → ${b.label}`,
    originId: a.id,
    originLabel: a.label,
    destinationId: b.id,
    destinationLabel: b.label,
    network: NETWORK_TER,
    daysOfWeek,
    timeWindow,
    minDelayMinutes,
    active,
  };
}

export function LiaisonForm({
  liaison,
  onSaved,
}: {
  liaison: LiaisonConfig;
  onSaved?: (next: LiaisonConfig) => void;
}) {
  const { outbound, inbound } = liaison;
  const dayFlags = flagsFromDays(outbound.daysOfWeek);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const autoNameHint = defaultLiaisonName(
    outbound.originLabel,
    outbound.destinationLabel,
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const stationA = {
      id: String(fd.get("stationAId") ?? "").trim(),
      label: String(fd.get("stationALabel") ?? "").trim(),
    };
    const stationB = {
      id: String(fd.get("stationBId") ?? "").trim(),
      label: String(fd.get("stationBLabel") ?? "").trim(),
    };
    const daysOfWeek = daysFromFlags(
      fd.get("weekdays") === "on",
      fd.get("weekend") === "on",
    );
    const minDelayMinutes = Number(fd.get("minDelayMinutes") ?? 10);
    const name = String(fd.get("name") ?? "").trim();

    const body = {
      name,
      outbound: legPayload(
        stationA,
        stationB,
        "outbound",
        daysOfWeek,
        {
          start: String(fd.get("outboundStart") ?? "07:00").slice(0, 5),
          end: String(fd.get("outboundEnd") ?? "09:30").slice(0, 5),
        },
        minDelayMinutes,
        fd.get("outboundActive") === "on",
      ),
      inbound: legPayload(
        stationB,
        stationA,
        "inbound",
        daysOfWeek,
        {
          start: String(fd.get("inboundStart") ?? "16:00").slice(0, 5),
          end: String(fd.get("inboundEnd") ?? "19:00").slice(0, 5),
        },
        minDelayMinutes,
        fd.get("inboundActive") === "on",
      ),
    };

    setSaving(true);
    setMsg(null);
    try {
      const next = await apiSend<LiaisonConfig>(
        `/v1/admin/liaisons/${liaison.id}`,
        "PUT",
        body,
      );
      setMsg({ text: "Liaison enregistrée", ok: true });
      onSaved?.(next);
    } catch {
      setMsg({ text: "Erreur à l’enregistrement", ok: false });
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      key={liaison.id}
      className="card voyage-form"
      onSubmit={(e) => void onSubmit(e)}
    >
      <p className="muted">
        Une paire de gares : le matin on surveille les départs de{" "}
        <strong>A vers B</strong>, le soir de <strong>B vers A</strong>. Réseau
        TER uniquement.
      </p>

      <label>
        Nom de la liaison
        <input
          name="name"
          defaultValue={liaison.name}
          placeholder={autoNameHint}
        />
      </label>
      <p className="muted field-hint">
        Si vide → <code>{autoNameHint}</code>
      </p>

      <fieldset className="voyage-section">
        <legend>Gares</legend>
        <div className="voyage-stations">
          <div className="voyage-station">
            <h3>Départ (matin)</h3>
            <label>
              Nom
              <input
                name="stationALabel"
                defaultValue={outbound.originLabel}
                required
              />
            </label>
            <label>
              Id technique
              <input
                name="stationAId"
                defaultValue={outbound.originId}
                required
              />
            </label>
          </div>
          <div className="voyage-station">
            <h3>Arrivée (soir)</h3>
            <label>
              Nom
              <input
                name="stationBLabel"
                defaultValue={outbound.destinationLabel}
                required
              />
            </label>
            <label>
              Id technique
              <input
                name="stationBId"
                defaultValue={outbound.destinationId}
                required
              />
            </label>
          </div>
        </div>
      </fieldset>

      <fieldset className="voyage-section">
        <legend>Jours</legend>
        <div className="voyage-days">
          <label className="check-inline">
            <input
              name="weekdays"
              type="checkbox"
              defaultChecked={dayFlags.weekdays}
            />{" "}
            Semaine (lun–ven)
          </label>
          <label className="check-inline">
            <input
              name="weekend"
              type="checkbox"
              defaultChecked={dayFlags.weekend}
            />{" "}
            Week-end (sam–dim)
          </label>
        </div>
      </fieldset>

      <div className="voyage-windows">
        <fieldset className="voyage-section voyage-leg">
          <legend>Aller</legend>
          <p className="muted voyage-leg-hint">
            Départs {outbound.originLabel || "A"} →{" "}
            {outbound.destinationLabel || "B"}
          </p>
          <div className="voyage-window-row">
            <label>
              Début
              <input
                name="outboundStart"
                type="time"
                defaultValue={outbound.timeWindow.start}
                required
              />
            </label>
            <label>
              Fin
              <input
                name="outboundEnd"
                type="time"
                defaultValue={outbound.timeWindow.end}
                required
              />
            </label>
          </div>
          <label className="check-inline">
            <input
              name="outboundActive"
              type="checkbox"
              defaultChecked={outbound.active}
            />{" "}
            Surveiller l’aller
          </label>
        </fieldset>

        <fieldset className="voyage-section voyage-leg">
          <legend>Retour</legend>
          <p className="muted voyage-leg-hint">
            Départs {inbound.originLabel || "B"} →{" "}
            {inbound.destinationLabel || "A"}
          </p>
          <div className="voyage-window-row">
            <label>
              Début
              <input
                name="inboundStart"
                type="time"
                defaultValue={inbound.timeWindow.start}
                required
              />
            </label>
            <label>
              Fin
              <input
                name="inboundEnd"
                type="time"
                defaultValue={inbound.timeWindow.end}
                required
              />
            </label>
          </div>
          <label className="check-inline">
            <input
              name="inboundActive"
              type="checkbox"
              defaultChecked={inbound.active}
            />{" "}
            Surveiller le retour
          </label>
        </fieldset>
      </div>

      <label>
        Seuil retard (min)
        <input
          name="minDelayMinutes"
          type="number"
          min={0}
          defaultValue={outbound.minDelayMinutes}
          required
        />
      </label>

      <button type="submit" disabled={saving}>
        {saving ? "Enregistrement…" : "Enregistrer la liaison"}
      </button>
      {msg && (
        <p className={`form-msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>
      )}
    </form>
  );
}
