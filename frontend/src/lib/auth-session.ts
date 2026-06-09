/** Short-lived sessionStorage handoff so a hard redirect after OTP doesn't race /api/auth/me. */

export const BOOTSTRAP_USER_KEY = "orryon_bootstrap_user";
export const LOGIN_TS_KEY = "orryon_login_ts";

export interface BootstrapUser {
  id: string;
  email: string;
  display_name: string;
  plan?: string;
  segment?: string;
}

export function stashBootstrapUser(user: BootstrapUser): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.setItem(BOOTSTRAP_USER_KEY, JSON.stringify(user));
  sessionStorage.setItem(LOGIN_TS_KEY, Date.now().toString());
}

/** Read bootstrap user without consuming — survives React Strict Mode double-mount. */
export function peekBootstrapUser(): BootstrapUser | null {
  if (typeof sessionStorage === "undefined") return null;
  const raw = sessionStorage.getItem(BOOTSTRAP_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as BootstrapUser;
  } catch {
    return null;
  }
}

/** True for ~60s after OTP verify — widen /api/auth/me retry / trust window. */
export function isFreshLogin(): boolean {
  if (typeof sessionStorage === "undefined") return false;
  const ts = sessionStorage.getItem(LOGIN_TS_KEY);
  if (!ts) return false;
  return Date.now() - Number(ts) < 60_000;
}

export function clearLoginMarkers(): void {
  if (typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(BOOTSTRAP_USER_KEY);
  sessionStorage.removeItem(LOGIN_TS_KEY);
}
