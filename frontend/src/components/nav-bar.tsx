"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import { SearchPanel } from "@/components/search-panel";
import { SiteNav } from "@/components/site-nav";
import { usePanels } from "@/lib/panel-context";
import { type Tab } from "@/components/nav-bar/types";
import { useNavBarToday } from "@/components/nav-bar/use-nav-bar-today";
import { NavBarHeaderActions } from "@/components/nav-bar/nav-bar-header-actions";
import { QuickAccessDrawer } from "@/components/nav-bar/quick-access-drawer";

export function NavBar() {
  const { openPanel, toggle } = usePanels();
  const [notifOpen, setNotifOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("today");

  const today = useNavBarToday(notifOpen);

  return (
    <>
      <SiteNav logoHref="/home" safeArea>
        <NavBarHeaderActions
          openPanel={openPanel}
          toggle={toggle}
          notifCount={today.totalCount}
          onOpenSearch={() => setSearchOpen(true)}
          onToggleNotifications={() => setNotifOpen((v) => !v)}
          notifOpen={notifOpen}
        />
      </SiteNav>

      <AnimatePresence>
        {searchOpen && <SearchPanel onClose={() => setSearchOpen(false)} />}
      </AnimatePresence>

      <AnimatePresence>
        {notifOpen && (
          <QuickAccessDrawer
            open={notifOpen}
            onClose={() => setNotifOpen(false)}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            today={today}
            onOpenDashboard={() => {
              setNotifOpen(false);
              toggle("dashboard");
            }}
          />
        )}
      </AnimatePresence>
    </>
  );
}
