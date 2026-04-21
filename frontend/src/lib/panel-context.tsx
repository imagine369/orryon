"use client";

import { createContext, useContext, useState, ReactNode } from "react";

type Panel = "dashboard" | "settings" | "streaks" | "journal" | "reset" | null;

interface PanelContextValue {
  openPanel: Panel;
  open: (panel: Panel) => void;
  close: () => void;
  toggle: (panel: Panel) => void;
}

const PanelContext = createContext<PanelContextValue>({
  openPanel: null,
  open: () => {},
  close: () => {},
  toggle: () => {},
});

export function PanelProvider({ children }: { children: ReactNode }) {
  const [openPanel, setOpenPanel] = useState<Panel>(null);

  const open = (panel: Panel) => setOpenPanel(panel);
  const close = () => setOpenPanel(null);
  const toggle = (panel: Panel) => setOpenPanel((prev) => (prev === panel ? null : panel));

  return (
    <PanelContext.Provider value={{ openPanel, open, close, toggle }}>
      {children}
    </PanelContext.Provider>
  );
}

export function usePanels() {
  return useContext(PanelContext);
}
