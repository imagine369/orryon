"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { api, clearToken, hasAuthSignal, hasToken } from "./api";
import { ApiError } from "./api-client";
import { migrateHabitsToServer } from "./migrate-habits";
import { invalidateSigningKey, prefetchSigningKey } from "./signing";
import { clearDemoFlagIfRemote, isDemoMode } from "./demo-mode";
import { formatDisplayName } from "./format-display-name";
import {
  clearLoginMarkers,
  isFreshLogin,
  peekBootstrapUser,
  type BootstrapUser,
} from "./auth-session";

interface User {
  id: string;
  email: string;
  display_name: string;
  plan?: string;
  segment?: string;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (user: User) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState>({
  user: null,
  loading: true,
  login: () => {},
  logout: async () => {},
});

const DEMO_USER: User = { id: "demo", email: "demo@orryon.app", display_name: "Alex" };

const FRESH_LOGIN_DELAYS_MS = [500, 1000, 1500, 2000, 3000, 4000, 5000, 8000];
const NORMAL_DELAYS_MS = [400, 1200];

function formatUser(u: BootstrapUser): User {
  return u.display_name
    ? { ...u, display_name: formatDisplayName(u.display_name) }
    : u;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isUnauthorized(err: unknown): boolean {
  if (err instanceof ApiError && err.status === 401) return true;
  return err instanceof Error && err.message === "Unauthorized";
}

async function fetchMeWithRetry(): Promise<User> {
  const fresh = isFreshLogin();
  const delays = fresh ? FRESH_LOGIN_DELAYS_MS : NORMAL_DELAYS_MS;
  const attempts = delays.length + 1;
  let lastErr: unknown;

  for (let i = 0; i < attempts; i++) {
    try {
      return await api.get<User>("/api/auth/me");
    } catch (err) {
      lastErr = err;
      if (isUnauthorized(err)) throw err;
      if (i < delays.length) await sleep(delays[i]);
    }
  }
  throw lastErr;
}

async function clearServerSession(): Promise<void> {
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
  } catch {
    /* ignore */
  }
}

function scheduleBackgroundMeCheck(setUser: (u: User | null) => void): void {
  void (async () => {
    for (const delay of [3000, 6000, 12000]) {
      await sleep(delay);
      if (!isFreshLogin()) return;
      try {
        const u = await api.get<User>("/api/auth/me");
        clearLoginMarkers();
        setUser(formatUser(u));
        prefetchSigningKey().catch(() => {});
        migrateHabitsToServer().catch(() => {});
        return;
      } catch (err) {
        if (isUnauthorized(err)) {
          await clearServerSession();
          clearToken();
          setUser(null);
          clearLoginMarkers();
          return;
        }
      }
    }
  })();
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useQueuedEffect(() => {
    let cancelled = false;

    clearDemoFlagIfRemote();
    if (isDemoMode()) {
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }

    void (async () => {
      const bootstrap = peekBootstrapUser();
      if (bootstrap) {
        setUser(formatUser(bootstrap));
      }

      if (!bootstrap && !hasAuthSignal() && !hasToken()) {
        if (!cancelled) setLoading(false);
        return;
      }

      try {
        const u = await fetchMeWithRetry();
        if (cancelled) return;
        clearLoginMarkers();
        setUser(formatUser(u));
        prefetchSigningKey().catch(() => {});
        migrateHabitsToServer().catch(() => {});
      } catch (err) {
        if (cancelled) return;
        if (isUnauthorized(err)) {
          if (bootstrap && isFreshLogin()) {
            // Cookie may not be visible to the server yet right after OTP — keep
            // the bootstrap user and revalidate without revoking the session.
            scheduleBackgroundMeCheck(setUser);
          } else {
            if (hasAuthSignal()) await clearServerSession();
            clearLoginMarkers();
            clearToken();
            setUser(null);
          }
        } else if (bootstrap && isFreshLogin()) {
          // OTP just succeeded; backend/proxy may still be cold. Trust bootstrap
          // and revalidate in the background — never revoke a fresh session.
          scheduleBackgroundMeCheck(setUser);
        } else {
          setUser(null);
        }
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("[auth] /api/auth/me failed:", (err as Error)?.message);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback((u: User) => {
    setUser(formatUser(u));
    prefetchSigningKey().catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    clearLoginMarkers();
    clearToken();
    invalidateSigningKey();
    if (typeof window !== "undefined") localStorage.removeItem("orryon_demo");
    await clearServerSession();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
