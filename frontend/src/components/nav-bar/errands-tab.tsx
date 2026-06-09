"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { isDemo } from "@/components/dashboard/demo-data";
import { isLocalHostClient } from "@/lib/demo-mode";
import { api, ApiError } from "@/lib/api";
import { DEMO_FULFILLMENT_HANDOFFS } from "@/lib/fulfillment-demo-data";
import { UPGRADE_PATH } from "@/lib/pricing-tiers";
import { useDataRefresh } from "@/lib/use-data-refresh";
import { FulfillmentCardList } from "@/components/fulfillment/fulfillment-card";
import type { FulfillmentHandoff } from "@/lib/fulfillment-types";

export function ErrandsTab() {
  const [handoffs, setHandoffs] = useState<FulfillmentHandoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [demoPreview, setDemoPreview] = useState(false);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (isDemo()) {
      setDemoPreview(true);
      setEnabled(true);
      setUpgradeRequired(false);
      setLoadError(null);
      setHandoffs(DEMO_FULFILLMENT_HANDOFFS);
      setLoading(false);
      return;
    }

    setDemoPreview(false);
    setLoading(true);
    api
      .get<{ enabled: boolean; handoffs: FulfillmentHandoff[] }>("/api/fulfillment/handoffs")
      .then((d) => {
        setEnabled(d.enabled !== false);
        setHandoffs(d.handoffs ?? []);
        setUpgradeRequired(false);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        setHandoffs([]);
        if (err instanceof ApiError && err.status === 403) {
          setUpgradeRequired(true);
          setLoadError(null);
        } else {
          setUpgradeRequired(false);
          setLoadError(
            err instanceof ApiError
              ? err.message
              : err instanceof Error
                ? err.message
                : "Could not load errands.",
          );
        }
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  useDataRefresh(["errands"], reload);

  const dismiss = async (id: string) => {
    setHandoffs((prev) => prev.filter((h) => h.id !== id));
    if (demoPreview) return;
    try {
      await api.post(`/api/fulfillment/handoffs/${id}/dismiss`, {});
    } catch {
      reload();
    }
  };

  const seedDemoHandoffs = async () => {
    setLoading(true);
    try {
      const d = await api.post<{ handoffs: FulfillmentHandoff[] }>(
        "/api/fulfillment/demo/seed",
        {},
      );
      setHandoffs(d.handoffs ?? []);
      setEnabled(true);
    } catch {
      /* non-fatal — user may not have ENABLE_DEMO */
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <p className="text-sm text-white/25 py-6 text-center">Loading errands…</p>;
  }

  if (!enabled) {
    return (
      <p className="text-sm text-white/30 py-6 text-center leading-relaxed">
        Errand handoffs are not enabled on this server.
      </p>
    );
  }

  if (upgradeRequired) {
    return (
      <div className="py-8 text-center space-y-4 px-2">
        <p className="text-sm text-white/35 leading-relaxed">
          Errand handoffs — rides, delivery, groceries, reservations, and pharmacy — are included
          with Pro, Premium, and Premium Plus.
        </p>
        <Link
          href={UPGRADE_PATH}
          className="inline-block text-xs text-white/50 hover:text-white/80 underline transition"
        >
          Upgrade to unlock errands
        </Link>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="py-8 text-center space-y-4 px-2">
        <p className="text-sm text-white/35 leading-relaxed">{loadError}</p>
        <button
          type="button"
          onClick={reload}
          className="text-xs text-white/40 hover:text-white/70 underline transition"
        >
          Try again
        </button>
      </div>
    );
  }

  if (handoffs.length === 0) {
    return (
      <div className="py-8 text-center space-y-4">
        <p className="text-sm text-white/35 leading-relaxed">
          No pending errands. Ask Orryon for a ride, delivery, groceries, reservation, or pharmacy
          pickup.
        </p>
        {isLocalHostClient() && (
          <button
            type="button"
            onClick={seedDemoHandoffs}
            className="text-xs text-white/40 hover:text-white/70 underline transition"
          >
            Load sample errands for screenshots (dev)
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-3 pb-2">
      {demoPreview ? (
        <p className="text-[10px] text-white/30 text-center uppercase tracking-widest">
          Preview sample errands
        </p>
      ) : (
        <p className="text-xs text-white/30 uppercase tracking-widest">Pending handoffs</p>
      )}
      <FulfillmentCardList handoffs={handoffs} compact onDismiss={dismiss} />
    </div>
  );
}
