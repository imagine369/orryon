import { api } from "@/lib/api";

export async function openBillingPortal(setBillingLoading: (loading: boolean) => void) {
  setBillingLoading(true);
  try {
    const res = await api.post<{ portal_url: string }>("/api/subscription/portal");
    window.location.href = res.portal_url;
  } catch {
    setBillingLoading(false);
  }
}
