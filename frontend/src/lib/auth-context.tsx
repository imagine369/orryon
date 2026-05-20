"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { api, clearToken, hasAuthSignal, hasToken } from "./api";
import { migrateHabitsToServer } from "./migrate-habits";
import { invalidateSigningKey, prefetchSigningKey } from "./signing";

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && localStorage.getItem("orryon_demo") === "true") {
      setUser(DEMO_USER);
      setLoading(false);
      return;
    }
    // Fast path: no auth signal cookie AND no legacy token → unauthenticated.
    // Skip the /auth/me round-trip; avoids an annoying 401 log on every cold
    // start for logged-out visitors.
    if (!hasAuthSignal() && !hasToken()) {
      setLoading(false);
      return;
    }
    api
      .get<User>("/api/auth/me")
      .then((u) => {
        setUser(u);
        prefetchSigningKey().catch(() => {});
        migrateHabitsToServer().catch(() => {});
      })
      .catch((err) => {
        // Don't fire /api/auth/logout here. That used to be "best-effort
        // cookie clear" but in practice it created a self-inflicted bounce:
        // a single transient 401 (e.g. backend cold-start race against the
        // cookie) wiped the freshly-issued session and forced the user back
        // to /login forever. Just clear local React state — if the cookie
        // really is invalid, the very next request will 401 again and the
        // user can manually re-auth.
        if (process.env.NODE_ENV !== "production") {
          // eslint-disable-next-line no-console
          console.warn("[auth] /api/auth/me failed:", (err as Error)?.message);
        }
        clearToken();
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((u: User) => {
    // Cookies were set by /api/auth/login (or /api/auth/demo-login); we just
    // need to remember the user object in React state.
    setUser(u);
    prefetchSigningKey().catch(() => {});
  }, []);

  const logout = useCallback(async () => {
    clearToken();
    invalidateSigningKey();
    if (typeof window !== "undefined") localStorage.removeItem("orryon_demo");
    try {
      await fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" });
    } catch {
      /* ignore — we still want to clear local state */
    }
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
