import type { HealthResponse } from "@sncf-alerts/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiGet } from "./client";
import { subscribeApiResult } from "./statusBus";

export type ApiConnectionStatus = "unknown" | "connected" | "disconnected";

const HEALTH_INTERVAL_MS = 10 * 60 * 1000;

type ApiStatusContextValue = {
  status: ApiConnectionStatus;
  checkedAt: string | null;
};

const ApiStatusContext = createContext<ApiStatusContextValue>({
  status: "unknown",
  checkedAt: null,
});

export function ApiStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<ApiConnectionStatus>("unknown");
  const [checkedAt, setCheckedAt] = useState<string | null>(null);

  const apply = useCallback((ok: boolean) => {
    setStatus(ok ? "connected" : "disconnected");
    setCheckedAt(new Date().toISOString());
  }, []);

  useEffect(() => subscribeApiResult(apply), [apply]);

  useEffect(() => {
    let cancelled = false;

    async function ping() {
      if (cancelled) return;
      try {
        await apiGet<HealthResponse>("/v1/health");
      } catch {
        // Le client a déjà reporté l’échec via statusBus
      }
    }

    void ping();
    const id = window.setInterval(() => void ping(), HEALTH_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  const value = useMemo(
    () => ({ status, checkedAt }),
    [status, checkedAt],
  );

  return (
    <ApiStatusContext.Provider value={value}>
      {children}
    </ApiStatusContext.Provider>
  );
}

export function useApiStatus(): ApiStatusContextValue {
  return useContext(ApiStatusContext);
}
