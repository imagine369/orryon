"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useAuth } from "@/lib/auth-context";
import { PanelProvider, usePanels } from "@/lib/panel-context";
import { NavBar } from "@/components/nav-bar";
import { DashboardPanel } from "@/components/dashboard-panel";
import { SettingsPanel } from "@/components/settings-panel";
import { StreakPanel } from "@/components/streak-panel";
import { JournalPanel } from "@/components/journal-panel";
import { ResetAnchorPanel } from "@/components/reset-anchor-panel";
import { TrialBanner } from "@/components/trial-banner";
import { InstallPrompt } from "@/components/install-prompt";
import { useSubscription } from "@/lib/use-subscription";
import { SubscriptionProvider } from "@/lib/subscription-service";

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const { openPanel } = usePanels();
  const isPanelOpen = openPanel !== null;
  const { sub } = useSubscription();

  const isFreeBreathe = !loading && !!user && (user.segment === "free_breathe" || user.plan === "free");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (isFreeBreathe) router.replace("/breathe");
  }, [loading, user, router, isFreeBreathe]);

  // Show spinner while loading OR while about to redirect — never flash the app shell.
  if (loading || !user || isFreeBreathe) {
    return (
      <div className="flex h-screen items-center justify-center bg-black">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Main content scales down when a panel is open */}
      <motion.div
        className="flex flex-col h-screen"
        animate={{
          scale: isPanelOpen ? 0.93 : 1,
          borderRadius: isPanelOpen ? 16 : 0,
          opacity: isPanelOpen ? 0.6 : 1,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 32, mass: 0.9 }}
        style={{ transformOrigin: "center center", willChange: "transform" }}
      >
        <NavBar />
        {sub && <TrialBanner sub={sub} />}
        <main className="flex-1 min-h-0">{children}</main>
      </motion.div>

      {/* Overlay panels */}
      <DashboardPanel />
      <SettingsPanel />
      <StreakPanel />
      <JournalPanel />
      <ResetAnchorPanel />
      <InstallPrompt />
    </div>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <PanelProvider>
      <SubscriptionProvider>
        <AppShell>{children}</AppShell>
      </SubscriptionProvider>
    </PanelProvider>
  );
}
