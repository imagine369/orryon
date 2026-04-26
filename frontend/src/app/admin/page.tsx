"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { api } from "@/lib/api";

const ADMIN_EMAIL = "sato@orryon.com";

type UserRow = {
  id: string;
  email: string;
  display_name: string;
  plan: string;
  segment: string;
  billing_interval: string;
  trial_ends_at: string;
  trial_days_remaining: number | null;
  created_at: string;
  stripe_customer_id: string;
  stripe_subscription_id: string;
};

type AdminData = {
  total: number;
  counts: Record<string, number>;
  groups: Record<string, UserRow[]>;
  all: UserRow[];
};

const TABS = [
  { key: "free_breathe", label: "Free Breathe", color: "text-teal-400", dot: "bg-teal-400" },
  { key: "trial",        label: "Trial",        color: "text-yellow-400", dot: "bg-yellow-400" },
  { key: "pro",          label: "Pro",          color: "text-purple-400", dot: "bg-purple-400" },
  { key: "other",        label: "Other",        color: "text-white/40",   dot: "bg-white/20" },
  { key: "all",          label: "All Users",    color: "text-white/70",   dot: "bg-white/40" },
];

function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return iso; }
}

function PlanBadge({ plan, segment }: { plan: string; segment: string }) {
  if (segment === "free_breathe") return (
    <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase tracking-widest bg-teal-500/15 text-teal-400">Free Breathe</span>
  );
  if (plan === "trial") return (
    <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase tracking-widest bg-yellow-500/15 text-yellow-400">Trial</span>
  );
  if (plan === "pro") return (
    <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase tracking-widest bg-purple-500/15 text-purple-400">Pro</span>
  );
  return (
    <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-semibold uppercase tracking-widest bg-white/10 text-white/40">{plan || "free"}</span>
  );
}

function UserCard({ user }: { user: UserRow }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-5 py-4 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-white truncate">{user.display_name || "—"}</p>
          <PlanBadge plan={user.plan} segment={user.segment} />
          {user.billing_interval && (
            <span className="px-2 py-0.5 rounded-full text-[0.6rem] font-medium uppercase tracking-wider bg-white/8 text-white/40">
              {user.billing_interval}
            </span>
          )}
        </div>
        <p className="text-xs text-white/50 truncate">{user.email}</p>
        {user.trial_days_remaining !== null && (
          <p className="text-[0.65rem] text-yellow-400/70 mt-1">{user.trial_days_remaining}d left in trial</p>
        )}
      </div>
      <div className="text-right shrink-0">
        <p className="text-[0.65rem] text-white/30">Joined</p>
        <p className="text-[0.72rem] text-white/60">{formatDate(user.created_at)}</p>
        {user.stripe_subscription_id && (
          <p className="text-[0.6rem] text-white/20 mt-1 font-mono">stripe ✓</p>
        )}
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<AdminData | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [activeTab, setActiveTab] = useState("free_breathe");

  const isAdmin = user?.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (!loading && user && !isAdmin) router.replace("/home");
  }, [loading, user, isAdmin, router]);

  useEffect(() => {
    if (!isAdmin) return;
    api.get<AdminData>("/api/admin/users")
      .then(setData)
      .catch((e) => setFetchError(e?.message || "Failed to load users"));
  }, [isAdmin]);

  if (loading || !user || !isAdmin) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  const activeUsers: UserRow[] = data
    ? activeTab === "all"
      ? data.all
      : data.groups[activeTab] ?? []
    : [];

  const activeTabMeta = TABS.find((t) => t.key === activeTab)!;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-5 pt-10 pb-20">

        {/* Header */}
        <div className="mb-8">
          <p className="text-[0.6rem] uppercase tracking-[4px] text-white/30 mb-1">Admin</p>
          <h1 className="text-2xl font-bold text-white font-[family-name:var(--font-playfair)]">User Management</h1>
          {data && (
            <p className="text-sm text-white/40 mt-1">{data.total} total users</p>
          )}
        </div>

        {/* Summary cards */}
        {data && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-8">
            {TABS.filter(t => t.key !== "all").map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-xl border p-4 text-left transition-all ${
                  activeTab === tab.key
                    ? "border-white/20 bg-white/[0.07]"
                    : "border-white/8 bg-white/[0.02] hover:border-white/15 hover:bg-white/[0.04]"
                }`}
              >
                <div className={`text-2xl font-bold mb-1 ${tab.color}`}>
                  {data.counts[tab.key] ?? 0}
                </div>
                <div className="text-[0.65rem] uppercase tracking-widest text-white/40">{tab.label}</div>
              </button>
            ))}
          </div>
        )}

        {/* Tab bar */}
        <div className="flex rounded-full border border-white/8 bg-[#111] p-0.5 mb-6">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className="flex-1 rounded-full px-3 py-2 text-xs font-medium transition-all duration-200 flex items-center justify-center gap-1.5 whitespace-nowrap"
              style={{
                background: activeTab === tab.key ? "rgba(255,255,255,0.1)" : "transparent",
                color: activeTab === tab.key ? "white" : "rgba(255,255,255,0.35)",
              }}
            >
              <span className={`inline-block w-1.5 h-1.5 rounded-full ${tab.dot}`} />
              {tab.label}
              {data && tab.key !== "all" && (
                <span className="opacity-50">({data.counts[tab.key] ?? 0})</span>
              )}
            </button>
          ))}
        </div>

        {/* User list */}
        {fetchError ? (
          <p className="text-red-400 text-sm">{fetchError}</p>
        ) : !data ? (
          <div className="flex justify-center py-12">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white" />
          </div>
        ) : activeUsers.length === 0 ? (
          <div className="rounded-xl border border-white/8 bg-white/[0.02] px-5 py-10 text-center">
            <p className="text-white/30 text-sm">No {activeTabMeta.label} users yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {activeUsers.map((u) => (
              <UserCard key={u.id} user={u} />
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
