"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { api, clearToken, hasAuthSignal, hasToken } from "./api";
import { migrateHabitsToServer } from "./migrate-habits";

interface User {
  id: string;
  email: string;
  display_name: string;
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
        migrateHabitsToServer().catch(() => {});
      })
      .catch(() => {
        clearToken();
        // Cookies may be stale; best-effort clear.
        fetch("/api/auth/logout", { method: "POST", credentials: "same-origin" }).catch(() => {});
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback((u: User) => {
    // Cookies were set by /api/auth/login (or /api/auth/demo-login); we just
    // need to remember the user object in React state.
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    clearToken();
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
