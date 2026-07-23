import type { DashboardOverview } from "@sncf-alerts/shared";
import { apiGet, apiSend } from "./api/client";

type Route = "dashboard" | "admin";

function routeFromHash(): Route {
  return location.hash === "#/admin" ? "admin" : "dashboard";
}

function layout(content: string): string {
  return `
    <header class="top">
      <strong>SNCF-Alerts</strong>
      <nav>
        <a href="#/">Dashboard</a>
        <a href="#/admin">Admin</a>
      </nav>
    </header>
    <main>${content}</main>
  `;
}

async function renderDashboard(root: HTMLElement) {
  root.innerHTML = layout(`<p class="muted">Chargement…</p>`);
  try {
    const data = await apiGet<DashboardOverview>("/v1/dashboard/overview");
    root.innerHTML = layout(`
      <h1>Dashboard</h1>
      <p class="muted">Accès lecture — protéger par le réseau (VPN/firewall).</p>
      <section class="grid">
        <article>
          <h2>Aller</h2>
          <p>${data.journeys.outbound?.label ?? "—"}</p>
          <p>Actif : <strong>${data.journeys.outbound?.active ? "oui" : "non"}</strong></p>
          <p>${data.journeys.outbound?.latestEvent?.title ?? "Aucun événement"}</p>
        </article>
        <article>
          <h2>Retour</h2>
          <p>${data.journeys.inbound?.label ?? "—"}</p>
          <p>Actif : <strong>${data.journeys.inbound?.active ? "oui" : "non"}</strong></p>
          <p>${data.journeys.inbound?.latestEvent?.title ?? "Aucun événement"}</p>
        </article>
      </section>
      <section>
        <h2>Stats 24h</h2>
        <ul>
          <li>Événements : ${data.stats.eventsLast24h}</li>
          <li>Envoyés : ${data.stats.deliveriesSentLast24h}</li>
          <li>Échecs : ${data.stats.deliveriesFailedLast24h}</li>
          <li>Ingest : ${data.stats.ingestProvider}</li>
        </ul>
      </section>
    `);
  } catch (err) {
    root.innerHTML = layout(`
      <h1>Dashboard</h1>
      <p class="error">API indisponible. Vérifiez que <code>apps/api</code> tourne.</p>
      <pre>${err instanceof Error ? err.message : String(err)}</pre>
    `);
  }
}

function renderAdmin(root: HTMLElement) {
  root.innerHTML = layout(`
    <h1>Console admin</h1>
    <p class="muted">Login simple — session skeleton (Bearer dev).</p>
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
      const res = await apiSend<{ authenticated: boolean; token: string }>(
        "/v1/admin/login",
        "POST",
        {
          username: String(fd.get("username") ?? ""),
          password: String(fd.get("password") ?? ""),
        },
      );
      sessionStorage.setItem("adminToken", res.token);
      result.textContent = "Connecté (token stocké en sessionStorage — à remplacer par cookie httpOnly).";
      result.className = "ok";
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
  if (route === "admin") renderAdmin(root as HTMLElement);
  else await renderDashboard(root as HTMLElement);
}

window.addEventListener("hashchange", () => {
  void render();
});
void render();
