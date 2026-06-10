/** Register the public service worker so mobile browsers can install Orryon as a PWA. */
export function serviceWorkerScriptUrl(registration: ServiceWorkerRegistration): string | null {
  const active = registration.active?.scriptURL;
  if (active) return active;
  const waiting = registration.waiting?.scriptURL;
  if (waiting) return waiting;
  return registration.installing?.scriptURL ?? null;
}

/** True when an Orryon service worker is already registered for /. */
export function hasOrryonServiceWorker(
  registration: ServiceWorkerRegistration | undefined,
): boolean {
  if (!registration) return false;
  const script = serviceWorkerScriptUrl(registration);
  return Boolean(script?.includes("/sw.js"));
}

export async function registerServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    const existing = await navigator.serviceWorker.getRegistration("/");
    if (hasOrryonServiceWorker(existing)) return;

    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    // Private mode, blocked context, or unsupported — install falls back to manual steps.
  }
}
