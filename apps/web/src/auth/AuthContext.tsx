import type { AuthConfigPublic, AuthMe, UserRole } from "@sncf-alerts/shared";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiGet, apiSend } from "../api/client";

const VISITOR_ACK_KEY = "sncf_visitor_ack";

type AuthContextValue = {
  loading: boolean;
  me: AuthMe | null;
  visitorEnabled: boolean;
  showGate: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  continueAsVisitor: () => void;
  requestLogin: () => void;
  refreshConfig: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function readVisitorAck(): boolean {
  try {
    return sessionStorage.getItem(VISITOR_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<AuthMe | null | undefined>(undefined);
  const [visitorEnabled, setVisitorEnabled] = useState<boolean | undefined>(
    undefined,
  );
  const [visitorAck, setVisitorAck] = useState(readVisitorAck);

  const refreshMe = useCallback(async () => {
    try {
      const user = await apiGet<AuthMe>("/v1/admin/me");
      setMe(user);
    } catch {
      setMe(null);
    }
  }, []);

  const refreshConfig = useCallback(async () => {
    try {
      const cfg = await apiGet<AuthConfigPublic>("/v1/auth/config");
      setVisitorEnabled(cfg.visitorEnabled);
    } catch {
      setVisitorEnabled(false);
    }
  }, []);

  useEffect(() => {
    void refreshMe();
    void refreshConfig();
  }, [refreshConfig, refreshMe]);

  const login = useCallback(async (username: string, password: string) => {
    const user = await apiSend<{ username: string; role: UserRole }>(
      "/v1/admin/login",
      "POST",
      {
        username,
        password,
      },
    );
    try {
      sessionStorage.removeItem(VISITOR_ACK_KEY);
    } catch {
      /* ignore */
    }
    setVisitorAck(false);
    setMe({ username: user.username, role: user.role });
  }, []);

  const logout = useCallback(async () => {
    try {
      await apiSend("/v1/admin/logout", "POST");
    } catch {
      /* ignore */
    }
    setMe(null);
  }, []);

  const continueAsVisitor = useCallback(() => {
    try {
      sessionStorage.setItem(VISITOR_ACK_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisitorAck(true);
  }, []);

  const requestLogin = useCallback(() => {
    try {
      sessionStorage.removeItem(VISITOR_ACK_KEY);
    } catch {
      /* ignore */
    }
    setVisitorAck(false);
  }, []);

  const loading = me === undefined || visitorEnabled === undefined;
  const authed = Boolean(me);
  const canEnter =
    authed || (Boolean(visitorEnabled) && visitorAck);
  const showGate = !loading && !canEnter;

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      me: me ?? null,
      visitorEnabled: visitorEnabled ?? false,
      showGate,
      login,
      logout,
      continueAsVisitor,
      requestLogin,
      refreshConfig,
    }),
    [
      continueAsVisitor,
      loading,
      login,
      logout,
      me,
      refreshConfig,
      requestLogin,
      showGate,
      visitorEnabled,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return ctx;
}
