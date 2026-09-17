import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiGet, apiPost, endLocalSession, revokeServerSession, setSessionExpiredHandler } from "../api/client";
import { clearStoredEmail, getAccessToken, getRefreshToken, getStoredEmail, setStoredEmail, setTokens } from "./token-storage";
import { sessionStatusFor } from "./session-status";
import {
  resolveMobilePersona,
  type AppRole,
  type MobilePersona,
  type PersonaResolution,
  type PortalAccessType,
} from "./role-to-persona";

export type { AppRole, MobilePersona, PersonaResolution, PortalAccessType };

/** GET /api/v1/mobile/session — oturumun tek sunucu kaynağı (bkz. docs/mobile/MOBILE_P0_HANDOFF.md). */
export type MobileSession = {
  userId: string;
  /** Efektif (yetki) rolü — BRANCH_MANAGER "unified" ise SCHOOL_ADMIN. */
  role: AppRole;
  /** Token'daki giriş rolü. */
  loginRole: AppRole;
  tenantId: string;
  teacherId?: string;
  studentId?: string;
  /** Yalnız STUDENT: SELF = öğrencinin kendisi, GUARDIAN = veli; aktif erişim yoksa null. */
  portalAccessType: PortalAccessType | null;
};

export type AuthUser = MobileSession & { email: string; resolution: PersonaResolution };

type LoginResponse = { user: { email?: string }; accessToken: string; refreshToken: string };
type Outcome = { ok: true } | { ok: false; message: string };

type AuthState = {
  /** "error": token var ama oturum doğrulanamadı (ağ/sunucu) — token'lar KORUNUR, `retry` ile tekrar denenir. */
  status: "loading" | "signedOut" | "signedIn" | "error";
  user: AuthUser | null;
  error: string | null;
  login: (email: string, password: string) => Promise<Outcome>;
  logout: () => Promise<void>;
  retry: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

/** Oturumdaki kullanıcının mobil persona'sı; desteklenmeyen hesapta null. */
export function personaOf(user: AuthUser | null | undefined): MobilePersona | null {
  return user?.resolution.kind === "persona" ? user.resolution.persona : null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthState["status"]>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const signOutLocally = useCallback(() => {
    setUser(null);
    setError(null);
    setStatus("signedOut");
  }, []);

  /** 401 → güvenli çıkış; diğer hatalar (ağ/5xx) → çıkış YOK, "error" durumu. */
  const loadSession = useCallback(
    async (email: string): Promise<Outcome> => {
      const res = await apiGet<MobileSession>("/api/v1/mobile/session");
      if (res.ok) {
        setUser({ ...res.data, email, resolution: resolveMobilePersona(res.data) });
        setError(null);
        setStatus("signedIn");
        return { ok: true };
      }
      if (sessionStatusFor(res) === "signedOut") {
        await endLocalSession();
        signOutLocally();
      } else {
        setError(res.error.message);
        setStatus("error");
      }
      return { ok: false, message: res.error.message };
    },
    [signOutLocally]
  );

  useEffect(() => setSessionExpiredHandler(signOutLocally), [signOutLocally]);

  useEffect(() => {
    (async () => {
      if (await getAccessToken()) await loadSession((await getStoredEmail()) ?? "");
      else signOutLocally();
    })();
  }, [loadSession, signOutLocally]);

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      error,
      async login(email, password) {
        const res = await apiPost<LoginResponse>("/api/v1/auth/login", { email, password });
        if (!res.ok) {
          if (res.error.code === "UNAUTHORIZED") return { ok: false, message: "E-posta veya şifre hatalı." };
          if (res.error.code === "VALIDATION_ERROR") return { ok: false, message: "Geçerli bir e-posta adresi ve şifre girin." };
          return { ok: false, message: res.error.message };
        }
        await setTokens(res.data.accessToken, res.data.refreshToken);
        const sessionEmail = res.data.user.email ?? email;
        await setStoredEmail(sessionEmail);
        const session = await loadSession(sessionEmail);
        if (!session.ok) {
          await endLocalSession();
          signOutLocally();
          void revokeServerSession(res.data.refreshToken);
        }
        return session;
      },
      async logout() {
        const refreshToken = await getRefreshToken();
        await endLocalSession();
        await clearStoredEmail();
        signOutLocally();
        if (refreshToken) void revokeServerSession(refreshToken);
      },
      retry() {
        setStatus("loading");
        void loadSession(user?.email ?? "");
      },
    }),
    [status, user, error, loadSession, signOutLocally]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
