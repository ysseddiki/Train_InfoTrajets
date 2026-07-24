import type { AlertDeliveryDto, DisruptionEventDto } from "@sncf-alerts/shared";
import { useEffect, useState } from "react";
import { apiGet } from "../api/client";
import { DeliveriesTable } from "../components/DeliveriesTable";
import { EventsTable } from "../components/EventsTable";
import { errorMessage } from "../lib/format";

export function NotificationsPage() {
  const [deliveries, setDeliveries] = useState<AlertDeliveryDto[] | null>(null);
  const [events, setEvents] = useState<DisruptionEventDto[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [d, e] = await Promise.all([
          apiGet<AlertDeliveryDto[]>("/v1/deliveries"),
          apiGet<DisruptionEventDto[]>("/v1/events"),
        ]);
        if (cancelled) return;
        setDeliveries(d);
        setEvents(e);
      } catch (err) {
        if (!cancelled) setError(errorMessage(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="page-enter">
        <h1>Notifications</h1>
        <p className="error">Impossible de charger l’historique.</p>
        <pre>{error}</pre>
      </div>
    );
  }

  if (!deliveries || !events) {
    return <p className="muted page-enter">Chargement…</p>;
  }

  return (
    <div className="page-enter">
      <h1>Notifications</h1>
      <p className="muted">
        Historique des livraisons et des événements détectés.
      </p>

      <section className="card">
        <h2>Livraisons</h2>
        <DeliveriesTable deliveries={deliveries} />
      </section>

      <section className="card" style={{ marginTop: "1rem" }}>
        <h2>Événements</h2>
        <EventsTable events={events} />
      </section>
    </div>
  );
}
