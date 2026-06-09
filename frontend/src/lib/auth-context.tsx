"use client";

import { createContext, useContext, useState, useCallback, type ReactNode } from "react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { api, clearToken, hasAuthSignal, hasToken } from "./api";
import { migrateHabitsToServer } from "./migrate-habits";
import { invalidateSigningKey, prefetchSigningKey } from "./signing";
import { clearDemoFlagIfRemote, isDemoMode } from "./demo-mode";
import { formatDisplayName } from "./format-display-name";
import {
  clearLoginMarkers,
  isFreshLogin,
  takeBootstrapUser,
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

function formatUser(u: BootstrapUser): User {
  return u.display_name
    ? { ...u, display_name: formatDisplayName(u.display_name) }
    : u;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchMeWithRetry(): Promise<User> {
  const attempts = isFreshLogin() ? 4 : 2;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await api.get<User>("/api/auth/me");
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await sleep(300 * (i + 1));
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useQueuedEffect(() => {
    clearDemoFlagIfRemote();
    if (isDemoMode()) {
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }

    void (async () => {
      const bootstrap = takeBootstrapUser();
      if (bootstrap) {
        setUser(formatUser(bootstrap));
      }

      if (!bootstrap && !hasAuthSignal() && !hasToken()) {
        setLoading(false);
        return;
      }

      try {
        const u = await fetchMeWithRetry();
        clearLoginMarkers();
        setUser(formatUser(u));
        prefetchSigningKey().catch(() => {});
        migrateHabitsToServer().catch(() => {});
      } catch (err) {
        clearLoginMarkers();
        // Drop stale cookies so we don't loop: orryon_auth=1 with a dead session
        // made every /home visit bounce straight back to /login.
        if (hasAuthSignal() || bootstrap) {
          await clearServerSession();
        }
        clearToken();
        setUser(null);
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("[auth] /api/auth/me failed:", (err as Error)?.message);
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const login = useCallback((u: User) => {
    // Cookies were set by /api/auth/login (or /api/auth/demo-login); we just
    // need to remember the user object in React state.
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
