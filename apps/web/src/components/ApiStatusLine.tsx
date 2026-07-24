import { useApiStatus } from "../api/ApiStatusContext";

export function ApiStatusLine() {
  const { status } = useApiStatus();

  const label =
    status === "connected"
      ? "Connecté"
      : status === "disconnected"
        ? "API hors ligne"
        : "Connexion…";

  return (
    <p
      className={`api-status api-status-${status}`}
      title="Statut de connexion à l’API"
      role="status"
    >
      <span className="api-status-dot" aria-hidden />
      <span className="api-status-label">{label}</span>
    </p>
  );
}
