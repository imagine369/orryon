"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type Panel = "dashboard" | "settings" | null;

interface PanelContextValue {
  openPanel: Panel;
  open: (panel: Panel) => void;
  close: () => void;
  toggle: (panel: Panel) => void;
  upgradeOpen: boolean;
  openUpgrade: () => void;
  closeUpgrade: () => void;
}

const PanelContext = createContext<PanelContextValue>({
  openPanel: null,
  open: () => {},
  close: () => {},
  toggle: () => {},
  upgradeOpen: false,
  openUpgrade: () => {},
  closeUpgrade: () => {},
});

export function PanelProvider({ children }: { children: ReactNode }) {
  const [openPanel, setOpenPanel] = useState<Panel>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const open = (panel: Panel) => setOpenPanel(panel);
  const close = () => setOpenPanel(null);
  const toggle = (panel: Panel) => setOpenPanel((prev) => (prev === panel ? null : panel));
  const openUpgrade = () => setUpgradeOpen(true);
  const closeUpgrade = () => setUpgradeOpen(false);

  return (
    <PanelContext.Provider value={{ openPanel, open, close, toggle, upgradeOpen, openUpgrade, closeUpgrade }}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanels() {
  return useContext(PanelContext);
}
