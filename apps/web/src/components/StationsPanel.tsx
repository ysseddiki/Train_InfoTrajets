import type { Station } from "@sncf-alerts/shared";
import { ExternalLink, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState, type FormEvent, type KeyboardEvent } from "react";
import { apiSend } from "../api/client";

export function StationsPanel({
  stations,
  onChange,
}: {
  stations: Station[];
  onChange: (next: Station[]) => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  const [externalId, setExternalId] = useState("");
  const [displayUrl, setDisplayUrl] = useState("");
  const [terminusHelpersEnabled, setTerminusHelpersEnabled] = useState(false);
  const [terminusHelperLabels, setTerminusHelperLabels] = useState<string[]>(
    [],
  );
  const [helperDraft, setHelperDraft] = useState("");
  const [helperPickId, setHelperPickId] = useState("");
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [searchDraft, setSearchDraft] = useState("");
  const [searchApplied, setSearchApplied] = useState("");

  const filtered = useMemo(() => {
    const q = searchApplied.trim().toLowerCase();
    if (!q) return stations;
    return stations.filter(
      (s) =>
        s.label.toLowerCase().includes(q) ||
        s.externalId.toLowerCase().includes(q),
    );
  }, [stations, searchApplied]);

  const pickableStations = useMemo(
    () =>
      stations.filter(
        (s) =>
          s.id !== editingId &&
          !terminusHelperLabels.some(
            (l) => l.toLowerCase() === s.label.toLowerCase(),
          ),
      ),
    [stations, editingId, terminusHelperLabels],
  );

  function startCreate() {
    setEditingId(null);
    setLabel("");
    setExternalId("");
    setDisplayUrl("");
    setTerminusHelpersEnabled(false);
    setTerminusHelperLabels([]);
    setHelperDraft("");
    setHelperPickId("");
    setMsg(null);
  }

  function startEdit(s: Station) {
    setEditingId(s.id);
    setLabel(s.label);
    setExternalId(s.externalId);
    setDisplayUrl(s.displayUrl ?? "");
    setTerminusHelpersEnabled(s.terminusHelpersEnabled);
    setTerminusHelperLabels([...s.terminusHelperLabels]);
    setHelperDraft("");
    setHelperPickId("");
    setMsg(null);
  }

  function onSearchSubmit(e: FormEvent) {
    e.preventDefault();
    setSearchApplied(searchDraft);
  }

  function addHelperLabel(raw: string) {
    const t = raw.trim();
    if (!t) return;
    setTerminusHelperLabels((prev) => {
      if (prev.some((x) => x.toLowerCase() === t.toLowerCase())) return prev;
      return [...prev, t].slice(0, 20);
    });
    setHelperDraft("");
  }

  function removeHelperLabel(labelToRemove: string) {
    setTerminusHelperLabels((prev) =>
      prev.filter((x) => x.toLowerCase() !== labelToRemove.toLowerCase()),
    );
  }

  function onHelperKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      addHelperLabel(helperDraft);
    }
  }

  function addHelperFromCatalog() {
    const s = stations.find((x) => x.id === helperPickId);
    if (!s) return;
    addHelperLabel(s.label);
    setHelperPickId("");
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const payload = {
      label,
      externalId,
      displayUrl: displayUrl.trim() || null,
      terminusHelpersEnabled,
      terminusHelperLabels,
    };
    try {
      if (editingId) {
        const updated = await apiSend<Station>(
          `/v1/admin/stations/${editingId}`,
          "PUT",
          payload,
        );
        onChange(stations.map((s) => (s.id === updated.id ? updated : s)));
        setMsg({ text: "Gare mise à jour", ok: true });
        setTerminusHelpersEnabled(updated.terminusHelpersEnabled);
        setTerminusHelperLabels([...updated.terminusHelperLabels]);
      } else {
        const created = await apiSend<Station>(
          "/v1/admin/stations",
          "POST",
          payload,
        );
        onChange(
          [...stations, created].sort((a, b) =>
            a.label.localeCompare(b.label, "fr"),
          ),
        );
        setMsg({ text: "Gare créée", ok: true });
        setEditingId(created.id);
        setTerminusHelpersEnabled(created.terminusHelpersEnabled);
        setTerminusHelperLabels([...created.terminusHelperLabels]);
      }
    } catch {
      setMsg({
        text: editingId
          ? "Erreur de mise à jour (id déjà pris ?)"
          : "Erreur de création (id déjà pris ?)",
        ok: false,
      });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete(s: Station) {
    if (!window.confirm(`Supprimer « ${s.label} » ?`)) return;
    setBusy(true);
    setMsg(null);
    try {
      await apiSend(`/v1/admin/stations/${s.id}`, "DELETE");
      onChange(stations.filter((x) => x.id !== s.id));
      if (editingId === s.id) startCreate();
      setMsg({ text: "Gare supprimée", ok: true });
    } catch {
      setMsg({
        text: "Suppression impossible (gare utilisée par une liaison)",
        ok: false,
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="stations-panel">
      <div className="stations-layout">
        <aside className="card stations-list">
          <div className="stations-list-head">
            <h3>Catalogue</h3>
            <button type="button" className="secondary" onClick={startCreate}>
              <Plus size={16} strokeWidth={2} aria-hidden />
              Nouvelle
            </button>
          </div>
          <form className="stations-search" onSubmit={onSearchSubmit}>
            <label>
              Filtrer (Entrée)
              <input
                type="search"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                placeholder="Nice, Monaco…"
                autoComplete="off"
              />
            </label>
            <p className="muted field-hint">
              Pas de recherche live : valide avec Entrée.
            </p>
          </form>
          {filtered.length === 0 ? (
            <p className="muted">
              {stations.length === 0
                ? "Aucune gare — créez-en une."
                : "Aucun résultat — Entrée pour relancer."}
            </p>
          ) : (
            <ul className="stations-items">
              {filtered.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={`stations-item${editingId === s.id ? " is-active" : ""}`}
                    onClick={() => startEdit(s)}
                  >
                    <span className="stations-item-label">
                      {s.label}
                      {s.terminusHelpersEnabled ? (
                        <span
                          className="pill stations-terminus-pill"
                          title="Terminus d’aide activés"
                        >
                          Terminus
                        </span>
                      ) : null}
                    </span>
                    <span className="muted stations-item-id">
                      {s.externalId}
                    </span>
                  </button>
                  {s.displayUrl ? (
                    <a
                      className="secondary stations-item-link"
                      href={s.displayUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      title="Ouvrir l’affichage gare"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <ExternalLink size={14} strokeWidth={2} aria-hidden />
                    </a>
                  ) : null}
                  <button
                    type="button"
                    className="secondary danger-ghost stations-item-del"
                    title="Supprimer"
                    onClick={() => void onDelete(s)}
                    disabled={busy}
                  >
                    <Trash2 size={14} strokeWidth={2} aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <form className="card stations-form" onSubmit={(e) => void onSubmit(e)}>
          <h3>
            {editingId ? (
              <>
                <Pencil size={16} strokeWidth={2} aria-hidden /> Modifier
              </>
            ) : (
              <>
                <Plus size={16} strokeWidth={2} aria-hidden /> Créer une gare
              </>
            )}
          </h3>
          <label>
            Nom
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nice-Ville"
              required
            />
          </label>
          <label>
            Id technique (Navitia)
            <input
              value={externalId}
              onChange={(e) => setExternalId(e.target.value)}
              placeholder="stop_area:SNCF:87756056"
              required
            />
          </label>
          <p className="muted field-hint">
            Identifiant <code>stop_area</code> utilisé pour les appels départs.
          </p>
          <label>
            Lien affichage gare
            <input
              type="url"
              value={displayUrl}
              onChange={(e) => setDisplayUrl(e.target.value)}
              placeholder="https://www.garesetconnexions.sncf/fr/gare/…"
            />
          </label>
          <p className="muted field-hint">
            URL Gares &amp; Connexions (ou autre page d’affichage) — optionnel.
          </p>
          {displayUrl.trim() ? (
            <p className="stations-display-preview">
              <a
                href={displayUrl.trim()}
                target="_blank"
                rel="noopener noreferrer"
              >
                Ouvrir le lien{" "}
                <ExternalLink size={14} strokeWidth={2} aria-hidden />
              </a>
            </p>
          ) : null}

          <fieldset className="stations-terminus">
            <legend>Terminus / destinations d’aide</legend>
            <p className="muted field-hint">
              Réservé au <strong>failover ZOU</strong> (pas Navitia). Quand cette
              gare est le filtre destination, ces libellés matchent le{" "}
              <strong>terminus commercial</strong> ZOU (headsign / dernier arrêt),
              pas tous les trains qui passent simplement par ces gares. Ex.
              Menton / Vintimille pour Monaco.
            </p>
            <label className="check-inline">
              <input
                type="checkbox"
                checked={terminusHelpersEnabled}
                onChange={(e) => setTerminusHelpersEnabled(e.target.checked)}
              />{" "}
              Activer l’aide terminus (failover ZOU)
            </label>

            <div
              className={`stations-terminus-body${terminusHelpersEnabled ? "" : " is-disabled"}`}
            >
              {terminusHelperLabels.length > 0 ? (
                <ul className="stations-helper-chips">
                  {terminusHelperLabels.map((h) => (
                    <li key={h}>
                      <span>{h}</span>
                      <button
                        type="button"
                        className="stations-helper-chip-del"
                        title={`Retirer ${h}`}
                        onClick={() => removeHelperLabel(h)}
                        disabled={!terminusHelpersEnabled || busy}
                      >
                        <X size={12} strokeWidth={2} aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="muted">Aucun terminus ajouté.</p>
              )}

              <label>
                Ajouter un libellé (Entrée)
                <input
                  value={helperDraft}
                  onChange={(e) => setHelperDraft(e.target.value)}
                  onKeyDown={onHelperKeyDown}
                  placeholder="Menton, Vintimille…"
                  disabled={!terminusHelpersEnabled || busy}
                  autoComplete="off"
                />
              </label>

              {pickableStations.length > 0 ? (
                <div className="stations-helper-pick">
                  <label>
                    Ou choisir une gare du catalogue
                    <select
                      value={helperPickId}
                      onChange={(e) => setHelperPickId(e.target.value)}
                      disabled={!terminusHelpersEnabled || busy}
                    >
                      <option value="">—</option>
                      {pickableStations.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      !terminusHelpersEnabled || !helperPickId || busy
                    }
                    onClick={addHelperFromCatalog}
                  >
                    Ajouter
                  </button>
                </div>
              ) : null}
            </div>
          </fieldset>

          <button type="submit" disabled={busy}>
            {busy
              ? "Enregistrement…"
              : editingId
                ? "Enregistrer"
                : "Créer la gare"}
          </button>
          {msg && (
            <p className={`form-msg ${msg.ok ? "ok" : "error"}`}>{msg.text}</p>
          )}
        </form>
      </div>
    </div>
  );
}
