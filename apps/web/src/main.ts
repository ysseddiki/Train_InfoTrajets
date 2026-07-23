import type {
  AlertDeliveryDto,
  BoardTrafficStatus,
  DashboardOverview,
  DisruptionEventDto,
  JourneyConfig,
  JourneyDirection,
  RecipientsConfig,
  SmtpConfigPublic,
  TeamsConfigPublic,
} from "@sncf-alerts/shared";
import { apiGet, apiSend } from "./api/client";

type Route = "dashboard" | "notifications" | "admin";

function routeFromHash(): Route {
  const h = location.hash;
  if (h === "#/admin") return "admin";
  if (h === "#/notifications") return "notifications";
  return "dashboard";
}

function layout(content: string): string {
  return `
    <header class="top">
      <strong>SNCF-Alerts</strong>
      <nav>
        <a href="#/">Dashboard</a>
        <a href="#/notifications">Notifications</a>
        <a href="#/admin">Admin</a>
      </nav>
    </header>
    <main>${content}</main>
  `;
}

function esc(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function boardClass(status: BoardTrafficStatus): string {
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

function ingestClass(status: string | null): string {
  if (status === "ok") return "status-box status-ok";
  if (status === "error") return "status-box status-delay";
  if (status === "skipped") return "status-box status-window";
  return "status-box status-nodata";
}

function formatWhen(iso: string | null): string {
  if (!iso) return "jamais";
  try {
    return new Date(iso).toLocaleString("fr-FR", {
      timeZone: "Europe/Paris",
    });
  } catch {
    return iso;
  }
}

function journeyCard(
  title: string,
  card: DashboardOverview["journeys"]["outbound"],
): string {
  if (!card) {
    return `<article><h2>${title}</h2><p class="muted">Non configuré</p></article>`;
  }
  return `
    <article>
      <h2>${title}</h2>
      <p>${esc(card.label)}</p>
      <p class="muted">${esc(card.originLabel)} → ${esc(card.destinationLabel)}</p>
      <div class="${boardClass(card.boardStatus)}">
        <strong>${esc(card.boardStatusLabel)}</strong>
      </div>
      <p class="muted">Surveillance : ${card.active ? "active" : "pause"}</p>
      <p>${esc(card.latestEvent?.title ?? "Aucun événement récent")}</p>
    </article>
  `;
}

async function renderDashboard(root: HTMLElement) {
  root.innerHTML = layout(`<p class="muted">Chargement…</p>`);
  try {
    const data = await apiGet<DashboardOverview>("/v1/dashboard/overview");
    const ingestStatus = data.lastIngest?.status ?? null;
    const ingestLabel =
      ingestStatus === "ok"
        ? "Dernière requête OK"
        : ingestStatus === "error"
          ? "Dernière requête en erreur"
          : ingestStatus === "skipped"
            ? "Dernière requête ignorée (hors fenêtre)"
            : "Aucune requête encore";

    root.innerHTML = layout(`
      <h1>Dashboard</h1>

      <section class="${ingestClass(ingestStatus)}">
        <strong>${esc(ingestLabel)}</strong>
        <p>Provider : ${esc(data.stats.ingestProvider)} · ${esc(formatWhen(data.lastIngest?.at ?? null))}</p>
        <p>${esc(data.lastIngest?.detail ?? "—")}</p>
      </section>

      <section class="grid">
        ${journeyCard("Aller", data.journeys.outbound)}
        ${journeyCard("Retour", data.journeys.inbound)}
      </section>
      <section>
        <h2>Stats 24h</h2>
        <ul>
          <li>Événements : ${data.stats.eventsLast24h}</li>
          <li>Envoyés : ${data.stats.deliveriesSentLast24h}</li>
          <li>Échecs : ${data.stats.deliveriesFailedLast24h}</li>
        </ul>
        <p><a href="#/notifications">Voir l’historique des notifications →</a></p>
      </section>
    `);
  } catch (err) {
    root.innerHTML = layout(`
      <h1>Dashboard</h1>
      <p class="error">API indisponible. Vérifiez que <code>apps/api</code> tourne.</p>
      <pre>${esc(err instanceof Error ? err.message : String(err))}</pre>
    `);
  }
}

async function renderNotifications(root: HTMLElement) {
  root.innerHTML = layout(`<p class="muted">Chargement…</p>`);
  try {
    const [deliveries, events] = await Promise.all([
      apiGet<AlertDeliveryDto[]>("/v1/deliveries"),
      apiGet<DisruptionEventDto[]>("/v1/events"),
    ]);

    const deliveryRows =
      deliveries.length === 0
        ? `<tr><td colspan="5" class="muted">Aucun envoi pour le moment</td></tr>`
        : deliveries
            .map(
              (d) => `
        <tr>
          <td>${esc(d.createdAt)}</td>
          <td>${esc(d.channel)}</td>
          <td>${esc(d.status)}</td>
          <td>${esc(d.direction ?? "—")}</td>
          <td>${esc(d.detail ?? "")}</td>
        </tr>`,
            )
            .join("");

    const eventRows =
      events.length === 0
        ? `<tr><td colspan="5" class="muted">Aucun événement</td></tr>`
        : events
            .map(
              (e) => `
        <tr>
          <td>${esc(e.detectedAt)}</td>
          <td>${esc(e.direction ?? "—")}</td>
          <td>${esc(e.kind)}</td>
          <td>${esc(e.title)}</td>
          <td>${e.delayMinutes ?? "—"}</td>
        </tr>`,
            )
            .join("");

    root.innerHTML = layout(`
      <h1>Notifications</h1>
      <p class="muted">Historique des livraisons et des événements détectés.</p>

      <section class="card">
        <h2>Livraisons</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Canal</th><th>Statut</th><th>Sens</th><th>Détail</th></tr>
            </thead>
            <tbody>${deliveryRows}</tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <h2>Événements</h2>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Date</th><th>Sens</th><th>Type</th><th>Titre</th><th>Retard</th></tr>
            </thead>
            <tbody>${eventRows}</tbody>
          </table>
        </div>
      </section>
    `);
  } catch (err) {
    root.innerHTML = layout(`
      <h1>Notifications</h1>
      <p class="error">Impossible de charger l’historique.</p>
      <pre>${esc(err instanceof Error ? err.message : String(err))}</pre>
    `);
  }
}

function journeyForm(j: JourneyConfig): string {
  const days = j.daysOfWeek.join(",");
  return `
    <form class="card journey-form" data-direction="${j.direction}">
      <h2>${j.direction === "outbound" ? "Aller" : "Retour"}</h2>
      <p class="muted">Comme l’écran en gare : on surveille les <strong>départs</strong> d’une gare, filtrés vers une destination.</p>
      <label>Label <input name="label" value="${esc(j.label)}" /></label>
      <label>Gare surveillée (id) <input name="originId" value="${esc(j.originId)}" /></label>
      <label>Gare surveillée (nom) <input name="originLabel" value="${esc(j.originLabel)}" /></label>
      <label>Filtre destination (id) <input name="destinationId" value="${esc(j.destinationId)}" /></label>
      <label>Filtre destination (nom) <input name="destinationLabel" value="${esc(j.destinationLabel)}" /></label>
      <label>Réseau <input name="network" value="${esc(j.network)}" /></label>
      <label>Jours (1=lun…7=dim) <input name="daysOfWeek" value="${esc(days)}" /></label>
      <label>Fenêtre début <input name="windowStart" value="${esc(j.timeWindow.start)}" /></label>
      <label>Fenêtre fin <input name="windowEnd" value="${esc(j.timeWindow.end)}" /></label>
      <label>Seuil retard (min) <input name="minDelayMinutes" type="number" value="${j.minDelayMinutes}" /></label>
      <label><input name="active" type="checkbox" ${j.active ? "checked" : ""} /> Actif (surveillance ON)</label>
      <button type="submit">Enregistrer</button>
      <p class="form-msg muted"></p>
    </form>
  `;
}

async function renderAdminConsole(root: HTMLElement, username: string) {
  const [outbound, inbound, recipients, smtp, teams] = await Promise.all([
    apiGet<JourneyConfig>("/v1/admin/journeys/outbound"),
    apiGet<JourneyConfig>("/v1/admin/journeys/inbound"),
    apiGet<RecipientsConfig>("/v1/admin/channels/recipients"),
    apiGet<SmtpConfigPublic>("/v1/admin/channels/smtp"),
    apiGet<TeamsConfigPublic>("/v1/admin/channels/teams"),
  ]);

  root.innerHTML = layout(`
    <h1>Console admin</h1>
    <p>Connecté : <strong>${esc(username)}</strong>
      <button type="button" id="logout-btn" class="secondary">Déconnexion</button>
    </p>

    <section class="grid">
      ${journeyForm(outbound)}
      ${journeyForm(inbound)}
    </section>

    <section class="card">
      <h2>Destinataires email</h2>
      <form id="recipients-form">
        <label>Emails (un par ligne)
          <textarea name="emails" rows="4">${esc(recipients.emails.join("\n"))}</textarea>
        </label>
        <button type="submit">Enregistrer</button>
        <p class="form-msg muted"></p>
      </form>
    </section>

    <section class="grid">
      <article class="card">
        <h2>SMTP</h2>
        <ul>
          <li>Activé : ${smtp.enabled ? "oui" : "non"}</li>
          <li>Host : ${esc(smtp.host || "—")}</li>
          <li>From : ${esc(smtp.fromAddress || "—")}</li>
          <li>Password : ${smtp.passwordConfigured ? "configuré" : "manquant"}</li>
        </ul>
        <p class="muted">Secrets SMTP via <code>.env</code> (jamais affichés).</p>
        <button type="button" id="test-email">Envoyer un test email</button>
        <p id="test-email-msg" class="muted"></p>
      </article>
      <article class="card">
        <h2>Teams</h2>
        <ul>
          <li>Activé : ${teams.enabled ? "oui" : "non"}</li>
          <li>Webhook : ${teams.webhookConfigured ? "configuré" : "manquant"}</li>
        </ul>
        <p class="muted">URL webhook via <code>.env</code>.</p>
        <button type="button" id="test-teams">Envoyer un test Teams</button>
        <p id="test-teams-msg" class="muted"></p>
      </article>
    </section>

    <section class="card debug">
      <h2>Debug ingest (admin)</h2>
      <p class="muted">Injecte un événement stub et déclenche le matching / notifications.</p>
      <label>Sens
        <select id="stub-direction">
          <option value="outbound">Aller</option>
          <option value="inbound">Retour</option>
        </select>
      </label>
      <label>Retard (min) <input id="stub-delay" type="number" value="15" /></label>
      <button type="button" id="stub-inject">Injecter événement stub</button>
      <p id="stub-msg" class="muted"></p>
    </section>
  `);

  root.querySelector("#logout-btn")?.addEventListener("click", async () => {
    await apiSend("/v1/admin/logout", "POST");
    location.hash = "#/admin";
    void render();
  });

  root.querySelectorAll<HTMLFormElement>(".journey-form").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const direction = form.dataset.direction as JourneyDirection;
      const fd = new FormData(form);
      const msg = form.querySelector(".form-msg") as HTMLElement;
      const days = String(fd.get("daysOfWeek") ?? "")
        .split(",")
        .map((x) => Number(x.trim()))
        .filter((n) => n >= 1 && n <= 7);
      try {
        await apiSend(`/v1/admin/journeys/${direction}`, "PUT", {
          label: String(fd.get("label") ?? ""),
          originId: String(fd.get("originId") ?? ""),
          originLabel: String(fd.get("originLabel") ?? ""),
          destinationId: String(fd.get("destinationId") ?? ""),
          destinationLabel: String(fd.get("destinationLabel") ?? ""),
          network: String(fd.get("network") ?? ""),
          daysOfWeek: days,
          timeWindow: {
            start: String(fd.get("windowStart") ?? "07:00"),
            end: String(fd.get("windowEnd") ?? "09:30"),
          },
          minDelayMinutes: Number(fd.get("minDelayMinutes") ?? 10),
          active: fd.get("active") === "on",
        });
        msg.textContent = "Enregistré";
        msg.className = "form-msg ok";
      } catch {
        msg.textContent = "Erreur";
        msg.className = "form-msg error";
      }
    });
  });

  root.querySelector("#recipients-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const fd = new FormData(form);
    const msg = form.querySelector(".form-msg") as HTMLElement;
    const emails = String(fd.get("emails") ?? "")
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean);
    try {
      await apiSend("/v1/admin/channels/recipients", "PUT", { emails });
      msg.textContent = "Enregistré";
      msg.className = "form-msg ok";
    } catch {
      msg.textContent = "Erreur";
      msg.className = "form-msg error";
    }
  });

  root.querySelector("#test-email")?.addEventListener("click", async () => {
    const msg = root.querySelector("#test-email-msg") as HTMLElement;
    try {
      const res = await apiSend<{ status: string; detail: string | null }>(
        "/v1/admin/channels/email/test",
        "POST",
      );
      msg.textContent = `${res.status}${res.detail ? ` — ${res.detail}` : ""}`;
      msg.className = res.status === "sent" ? "ok" : "error";
    } catch {
      msg.textContent = "Échec";
      msg.className = "error";
    }
  });

  root.querySelector("#test-teams")?.addEventListener("click", async () => {
    const msg = root.querySelector("#test-teams-msg") as HTMLElement;
    try {
      const res = await apiSend<{ status: string; detail: string | null }>(
        "/v1/admin/channels/teams/test",
        "POST",
      );
      msg.textContent = `${res.status}${res.detail ? ` — ${res.detail}` : ""}`;
      msg.className = res.status === "sent" ? "ok" : "error";
    } catch {
      msg.textContent = "Échec";
      msg.className = "error";
    }
  });

  root.querySelector("#stub-inject")?.addEventListener("click", async () => {
    const msg = root.querySelector("#stub-msg") as HTMLElement;
    const direction = (
      root.querySelector("#stub-direction") as HTMLSelectElement
    ).value as JourneyDirection;
    const delayMinutes = Number(
      (root.querySelector("#stub-delay") as HTMLInputElement).value,
    );
    try {
      await apiSend("/v1/admin/debug/stub-event", "POST", {
        direction,
        delayMinutes,
        kind: "delay",
      });
      msg.textContent = "Événement injecté — voir Notifications";
      msg.className = "ok";
    } catch {
      msg.textContent = "Échec injection";
      msg.className = "error";
    }
  });
}

async function renderAdmin(root: HTMLElement) {
  root.innerHTML = layout(`<p class="muted">Chargement…</p>`);
  try {
    const me = await apiGet<{ username: string }>("/v1/admin/me");
    await renderAdminConsole(root, me.username);
    return;
  } catch {
    // not logged in
  }

  root.innerHTML = layout(`
    <h1>Console admin</h1>
    <form id="login-form" class="card">
      <label>Username <input name="username" autocomplete="username" required /></label>
      <label>Password <input name="password" type="password" autocomplete="current-password" required /></label>
      <button type="submit">Se connecter</button>
      <p id="login-result" class="muted"></p>
    </form>
  `);

  const form = root.querySelector("#login-form") as HTMLFormElement;
  const result = root.querySelector("#login-result") as HTMLElement;
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    try {
      await apiSend("/v1/admin/login", "POST", {
        username: String(fd.get("username") ?? ""),
        password: String(fd.get("password") ?? ""),
      });
      await render();
    } catch {
      result.textContent = "Échec login";
      result.className = "error";
    }
  });
}

async function render() {
  const root = document.querySelector("#app");
  if (!root) return;
  const route = routeFromHash();
  if (route === "admin") await renderAdmin(root as HTMLElement);
  else if (route === "notifications") await renderNotifications(root as HTMLElement);
  else await renderDashboard(root as HTMLElement);
}

window.addEventListener("hashchange", () => {
  void render();
});
void render();
