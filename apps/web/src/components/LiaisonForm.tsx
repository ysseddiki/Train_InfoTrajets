import type { LiaisonConfig, Station } from "@sncf-alerts/shared";
import {
  clampWatchLeadHours,
  DEFAULT_WATCH_LEAD_HOURS,
  defaultLiaisonName,
  WATCH_LEAD_HOURS_MAX,
  WATCH_LEAD_HOURS_MIN,
} from "@sncf-alerts/shared";
import { Plus } from "lucide-react";
import {
  useMemo,
  useState,
  type FormEvent,
} from "react";
import { apiSend } from "../api/client";

const WEEKDAYS = [1, 2, 3, 4, 5] as const;
const WEEKEND = [6, 7] as const;
const NETWORK_TER = "ter";

const LEAD_OPTIONS = Array.from(
  { length: WATCH_LEAD_HOURS_MAX - WATCH_LEAD_HOURS_MIN + 1 },
  (_, i) => WATCH_LEAD_HOURS_MIN + i,
);

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
  watchAlways: boolean,
  watchLeadHours: number,
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
    watchAlways,
    watchLeadHours: clampWatchLeadHours(watchLeadHours),
    minDelayMinutes,
    active,
  };
}

function matchStationId(
  stations: Station[],
  externalId: string,
  label: string,
): string {
  const byId = stations.find((s) => s.externalId === externalId);
  if (byId) return byId.id;
  const byLabel = stations.find(
    (s) => s.label.toLowerCase() === label.toLowerCase(),
  );
  return byLabel?.id ?? "";
}

function StationPicker({
  name,
  title,
  stations,
  selectedId,
  onChange,
  onCreate,
}: {
  name: "A" | "B";
  title: string;
  stations: Station[];
  selectedId: string;
  onChange: (stationId: string) => void;
  onCreate: () => void;
}) {
  const selected = stations.find((s) => s.id === selectedId);
  const [filter, setFilter] = useState("");

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return stations;
    return stations.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.externalId.toLowerCase().includes(q),
    );
  }, [stations, filter]);

  // Garde la sélection visible même si hors filtre courant
  const options =
    selected && !filtered.some((s) => s.id === selected.id)
      ? [selected, ...filtered]
      : filtered;

  return (
    <div className="voyage-station">
      <h3>{title}</h3>
      <div className="station-picker-row">
        <div className="station-picker-fields">
          <label>
            Rechercher
            <input
              type="search"
              value={filter}
              placeholder="Filtrer la liste…"
              onChange={(e) => setFilter(e.target.value)}
              autoComplete="off"
            />
          </label>
          <label className="station-picker-select">
            Gare
            <select
              value={selectedId}
              onChange={(e) => onChange(e.target.value)}
              required
            >
              <option value="" disabled>
                {stations.length === 0
                  ? "Aucune gare — créez-en une"
                  : options.length === 0
                    ? "Aucun résultat pour ce filtre"
                    : "Choisir une gare…"}
              </option>
              {options.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          type="button"
          className="secondary station-create-btn"
          onClick={onCreate}
          title="Créer une gare"
        >
          <Plus size={16} strokeWidth={2} aria-hidden />
          Créer
        </button>
      </div>
      <input
        type="hidden"
        name={`station${name}Id`}
        value={selected?.externalId ?? ""}
      />
      <input
        type="hidden"
        name={`station${name}Label`}
        value={selected?.label ?? ""}
      />
      {selected && (
        <p className="muted field-hint station-id-hint">
          Id : <code>{selected.externalId}</code>
        </p>
      )}
      {filter.trim() ? (
        <p className="muted field-hint">
          {filtered.length} gare{filtered.length > 1 ? "s" : ""} dans le menu
        </p>
      ) : null}
    </div>
  );
}

function WatchFields({
  prefix,
  watchAlways,
  watchLeadHours,
  onAlwaysChange,
  onLeadChange,
}: {
  prefix: "outbound" | "inbound";
  watchAlways: boolean;
  watchLeadHours: number;
  onAlwaysChange: (v: boolean) => void;
  onLeadChange: (v: number) => void;
}) {
  return (
    <div className="voyage-watch">
      <label className="check-inline">
        <input
          name={`${prefix}WatchAlways`}
          type="checkbox"
          checked={watchAlways}
          onChange={(e) => onAlwaysChange(e.target.checked)}
        />{" "}
        Veille continue
      </label>
      <label className={watchAlways ? "is-disabled" : undefined}>
        Commencer la veille
        <select
          name={`${prefix}WatchLead`}
          value={String(watchLeadHours)}
          disabled={watchAlways}
          aria-disabled={watchAlways}
          onChange={(e) => onLeadChange(Number(e.target.value))}
        >
          {LEAD_OPTIONS.map((h) => (
            <option key={h} value={h}>
              {h === 0 ? "0 h avant (début trajet)" : `${h} h avant`}
            </option>
          ))}
        </select>
      </label>
      <input
        type="hidden"
        name={`${prefix}WatchLeadValue`}
        value={watchLeadHours}
      />
      <p className="muted field-hint">
        Fenêtre ci-dessus = trajet. La veille démarre plus tôt (ou en continu)
        pour anticiper les annonces.
      </p>
    </div>
  );
}

export function LiaisonForm({
  liaison,
  stations,
  onSaved,
  onCreateStation,
}: {
  liaison: LiaisonConfig;
  stations: Station[];
  onSaved?: (next: LiaisonConfig) => void;
  onCreateStation?: () => void;
}) {
  const { outbound, inbound } = liaison;
  const dayFlags = flagsFromDays(outbound.daysOfWeek);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [outboundAlways, setOutboundAlways] = useState(outbound.watchAlways);
  const [inboundAlways, setInboundAlways] = useState(inbound.watchAlways);
  const [outboundLead, setOutboundLead] = useState(
    clampWatchLeadHours(outbound.watchLeadHours ?? DEFAULT_WATCH_LEAD_HOURS),
  );
  const [inboundLead, setInboundLead] = useState(
    clampWatchLeadHours(inbound.watchLeadHours ?? DEFAULT_WATCH_LEAD_HOURS),
  );
  const [stationAId, setStationAId] = useState(() =>
    matchStationId(stations, outbound.originId, outbound.originLabel),
  );
  const [stationBId, setStationBId] = useState(() =>
    matchStationId(
      stations,
      outbound.destinationId,
      outbound.destinationLabel,
    ),
  );

  const stationA = useMemo(
    () => stations.find((s) => s.id === stationAId),
    [stations, stationAId],
  );
  const stationB = useMemo(
    () => stations.find((s) => s.id === stationBId),
    [stations, stationBId],
  );

  const autoNameHint = defaultLiaisonName(
    stationA?.label ?? outbound.originLabel,
    stationB?.label ?? outbound.destinationLabel,
  );

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!stationA || !stationB) {
      setMsg({ text: "Choisissez les deux gares (ou créez-en)", ok: false });
      return;
    }
    if (stationA.id === stationB.id) {
      setMsg({ text: "Départ et arrivée doivent être différents", ok: false });
      return;
    }
    const fd = new FormData(e.currentTarget);
    const daysOfWeek = daysFromFlags(
      fd.get("weekdays") === "on",
      fd.get("weekend") === "on",
    );
    const minDelayMinutes = Number(fd.get("minDelayMinutes") ?? 10);
    const name = String(fd.get("name") ?? "").trim();

    const body = {
      name,
      outbound: legPayload(
        { id: stationA.externalId, label: stationA.label },
        { id: stationB.externalId, label: stationB.label },
        "outbound",
        daysOfWeek,
        {
          start: String(fd.get("outboundStart") ?? "07:00").slice(0, 5),
          end: String(fd.get("outboundEnd") ?? "09:30").slice(0, 5),
        },
        outboundAlways,
        Number(
          fd.get("outboundWatchLeadValue") ??
            fd.get("outboundWatchLead") ??
            outboundLead,
        ),
        minDelayMinutes,
        fd.get("outboundActive") === "on",
      ),
      inbound: legPayload(
        { id: stationB.externalId, label: stationB.label },
        { id: stationA.externalId, label: stationA.label },
        "inbound",
        daysOfWeek,
        {
          start: String(fd.get("inboundStart") ?? "16:00").slice(0, 5),
          end: String(fd.get("inboundEnd") ?? "19:00").slice(0, 5),
        },
        inboundAlways,
        Number(
          fd.get("inboundWatchLeadValue") ??
            fd.get("inboundWatchLead") ??
            inboundLead,
        ),
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
      setOutboundAlways(next.outbound.watchAlways);
      setInboundAlways(next.inbound.watchAlways);
      setOutboundLead(clampWatchLeadHours(next.outbound.watchLeadHours));
      setInboundLead(clampWatchLeadHours(next.inbound.watchLeadHours));
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
          <StationPicker
            name="A"
            title="Gare A (départ aller / filtre retour)"
            stations={stations}
            selectedId={stationAId}
            onChange={setStationAId}
            onCreate={() => onCreateStation?.()}
          />
          <StationPicker
            name="B"
            title="Gare B (filtre aller / départ retour) — gare desservie"
            stations={stations}
            selectedId={stationBId}
            onChange={setStationBId}
            onCreate={() => onCreateStation?.()}
          />
        </div>
        <p className="muted field-hint">
          Le filtre n’est pas forcément le terminus : une gare <strong>desservie</strong>{" "}
          sur le parcours suffit (ex. Monaco sur un train Menton).
          Renseigne l’URL Gares &amp; Connexions dans le catalogue Gares.
        </p>
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
            Départs {stationA?.label || outbound.originLabel || "A"} →{" "}
            {stationB?.label || outbound.destinationLabel || "B"}
          </p>
          <div className="voyage-window-row">
            <label>
              Début trajet
              <input
                name="outboundStart"
                type="time"
                defaultValue={outbound.timeWindow.start}
                required
              />
            </label>
            <label>
              Fin trajet
              <input
                name="outboundEnd"
                type="time"
                defaultValue={outbound.timeWindow.end}
                required
              />
            </label>
          </div>
          <WatchFields
            prefix="outbound"
            watchAlways={outboundAlways}
            watchLeadHours={outboundLead}
            onAlwaysChange={setOutboundAlways}
            onLeadChange={setOutboundLead}
          />
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
            Départs {stationB?.label || inbound.originLabel || "B"} →{" "}
            {stationA?.label || inbound.destinationLabel || "A"}
          </p>
          <div className="voyage-window-row">
            <label>
              Début trajet
              <input
                name="inboundStart"
                type="time"
                defaultValue={inbound.timeWindow.start}
                required
              />
            </label>
            <label>
              Fin trajet
              <input
                name="inboundEnd"
                type="time"
                defaultValue={inbound.timeWindow.end}
                required
              />
            </label>
          </div>
          <WatchFields
            prefix="inbound"
            watchAlways={inboundAlways}
            watchLeadHours={inboundLead}
            onAlwaysChange={setInboundAlways}
            onLeadChange={setInboundLead}
          />
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
