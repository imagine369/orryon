/** Register the public service worker so mobile browsers can install Orryon as a PWA. */
export async function registerServiceWorker(): Promise<void> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;

  try {
    await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    // Private mode, blocked context, or unsupported — install falls back to manual steps.
  }
}
