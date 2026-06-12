"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Plus, X } from "lucide-react";
import { useQueuedEffect } from "@/lib/use-queued-effect";
import { useAuth } from "@/lib/auth-context";
import { isDemo } from "@/components/dashboard/demo-data";
import { isLocalHostClient } from "@/lib/demo-mode";
import { api, ApiError } from "@/lib/api";
import { DEMO_FULFILLMENT_HANDOFFS } from "@/lib/fulfillment-demo-data";
import { UPGRADE_PATH } from "@/lib/pricing-tiers";
import { scheduleDataChanged, useDataRefresh } from "@/lib/use-data-refresh";
import { SwipeToDelete } from "@/components/swipe-to-delete";
import { FulfillmentCard } from "@/components/fulfillment/fulfillment-card";
import type { FulfillmentHandoff } from "@/lib/fulfillment-types";

export function ErrandsTab() {
  const { user } = useAuth();
  const [handoffs, setHandoffs] = useState<FulfillmentHandoff[]>([]);
  const [loading, setLoading] = useState(true);
  const [enabled, setEnabled] = useState(true);
  const [demoPreview, setDemoPreview] = useState(false);
  const [upgradeRequired, setUpgradeRequired] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(() => {
    if (isDemo() && !user) {
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
  }, [user]);

  useQueuedEffect(() => reload(), [reload]);

  useDataRefresh(["errands"], reload);

  const dismiss = async (id: string) => {
    setHandoffs((prev) => prev.filter((h) => h.id !== id));
    if (demoPreview) return;
    try {
      await api.post(`/api/fulfillment/handoffs/${id}/dismiss`, {});
      scheduleDataChanged(["errands"]);
    } catch {
      reload();
    }
  };

  const addErrand = () => {
    const title = newTitle.trim();
    if (!title) return;
    const optimistic: FulfillmentHandoff = {
      id: `tmp-${Date.now()}`,
      type: "grocery",
      title,
      subtitle: "",
      action_label: "Shop on Instacart",
      action_url: "https://www.instacart.com/store/s",
      status: "pending",
      created_at: new Date().toISOString(),
    };
    setHandoffs((prev) => [optimistic, ...prev]);
    setNewTitle("");
    setAdding(false);
    if (demoPreview) return;
    api
      .post<{ handoff: FulfillmentHandoff }>("/api/fulfillment/handoffs", { title })
      .then((res) => {
        setHandoffs((prev) =>
          prev.map((h) => (h.id === optimistic.id ? res.handoff : h)),
        );
        scheduleDataChanged(["errands"]);
      })
      .catch(() => setHandoffs((prev) => prev.filter((h) => h.id !== optimistic.id)));
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

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div>
          <p className="text-[1.05rem] font-bold text-white/90 leading-tight tracking-tight">
            Errands
          </p>
          {demoPreview ? (
            <p className="text-[0.6rem] text-white/30 mt-0.5 uppercase tracking-widest">
              Preview sample errands
            </p>
          ) : handoffs.length > 0 ? (
            <p className="text-[0.6rem] text-white/25 mt-0.5">
              {handoffs.length} pending {handoffs.length === 1 ? "handoff" : "handoffs"}
            </p>
          ) : null}
        </div>
        <button
          type="button"
          onClick={() => {
            setAdding((v) => !v);
            setTimeout(() => inputRef.current?.focus(), 50);
          }}
          className="flex items-center justify-center w-11 h-11 rounded-full bg-white hover:bg-gray-200 transition"
        >
          {adding ? (
            <X className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
          ) : (
            <Plus className="h-3.5 w-3.5 text-black" strokeWidth={1.5} />
          )}
        </button>
      </div>

      {adding && (
        <div className="flex gap-2 mb-4 items-center">
          <input
            ref={inputRef}
            autoFocus
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addErrand()}
            placeholder="New errand…"
            className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-white/25 outline-none focus:border-white/20"
          />
          <button
            type="button"
            onClick={addErrand}
            className="px-3 py-2 bg-white text-black text-xs font-semibold rounded-lg hover:bg-gray-200 transition"
          >
            Add
          </button>
        </div>
      )}

      {handoffs.length === 0 && !adding && (
        <div className="py-8 text-center space-y-4">
          <p className="text-sm text-white/35 leading-relaxed">
            No pending errands. Ask Orryon for a ride, delivery, groceries, reservation, or
            pharmacy pickup.
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
      )}

      {handoffs.length > 0 && (
        <div className="space-y-2.5 pb-2">
          {handoffs.map((h) => (
            <SwipeToDelete key={h.id} onDelete={() => dismiss(h.id)}>
              <FulfillmentCard handoff={h} compact />
            </SwipeToDelete>
          ))}
        </div>
      )}
    </div>
  );
}
