import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet, apiPost } from "../api/client";
import { getAccessToken, setTokens, clearTokens } from "./token-storage";
import { roleToPersona, type AppRole } from "./role-to-persona";

export { roleToPersona };
export type { AppRole };

export type AuthUser = {
  userId: string;
  email: string;
  role: AppRole;
  tenantId: string;
  teacherId?: string;
  studentId?: string;
};

type LoginResponse = { user: AuthUser; accessToken: string; refreshToken: string };

type AuthState = {
  status: "loading" | "signedOut" | "signedIn";
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<{ ok: true } | { ok: false; message: string }>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    (async () => {
      const token = await getAccessToken();
      if (!token) {
        setStatus("signedOut");
        return;
      }
      const res = await apiGet<Omit<AuthUser, "email"> & { channel: string; requestId: string }>("/api/v1/auth/me");
      if (res.ok) {
        setUser({ ...res.data, email: "" });
        setStatus("signedIn");
      } else {
        await clearTokens();
        setStatus("signedOut");
      }
    })();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      async login(email, password) {
        const res = await apiPost<LoginResponse>("/api/v1/auth/login", { email, password });
        if (!res.ok) return { ok: false, message: res.error.message || "Giriş başarısız." };
        await setTokens(res.data.accessToken, res.data.refreshToken);
        setUser(res.data.user);
        setStatus("signedIn");
        return { ok: true };
      },
      async logout() {
        await clearTokens();
        setUser(null);
        setStatus("signedOut");
      },
    }),
    [status, user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
