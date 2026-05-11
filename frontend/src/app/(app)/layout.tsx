"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
import { usePreferences } from "@/lib/use-preferences";

function AppShell({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { openPanel } = usePanels();
  const isPanelOpen = openPanel !== null;
  const { sub, fetchError: subFetchError } = useSubscription();

  // Don't redirect on the Stripe success landing — the webhook may not have
  // fired yet, so plan/segment can still reflect the old free state for a
  // few seconds. The live subscription hook will correct itself shortly.
  const justUpgraded = searchParams.get("upgraded") === "1";

  // Only redirect to /breathe when:
  //  1. Auth is resolved and user is present
  //  2. Not mid-checkout landing (?upgraded=1)
  //  3. The subscription fetch succeeded (fetchError = false) — a transient
  //     backend hiccup must never bounce a legitimate Pro user to /breathe
  //  4. The user is genuinely on the free/breathe-only tier
  const isFreeBreathe =
    !loading &&
    !!user &&
    !justUpgraded &&
    !subFetchError &&
    sub !== null &&
    !sub.is_active_pro &&
    user.segment === "free_breathe";
  const { prefs } = usePreferences();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
    if (isFreeBreathe) router.replace("/breathe");
  }, [loading, user, router, isFreeBreathe]);

  // Apply Golden Mode class to <html> for app-wide font/size scaling
  useEffect(() => {
    const html = document.documentElement;
    if (prefs.golden_mode_enabled) {
      html.classList.add("golden-mode");
    } else {
      html.classList.remove("golden-mode");
    }
  }, [prefs.golden_mode_enabled]);

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
