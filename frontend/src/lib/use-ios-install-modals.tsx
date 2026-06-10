"use client";

import { useCallback, useState, type ReactNode } from "react";
import { IosInstallModal, IosSafariInstallModal } from "@/components/ios-install-modal";
import { iosInstallModalKind, type IosInstallModalKind } from "@/lib/ios-install";

/** Opens the correct iOS install modal for the current browser — always shows UI, never a silent no-op. */
export function useIosInstallModals(): {
  openIosInstall: () => void;
  iosInstallModals: ReactNode;
} {
  const [openKind, setOpenKind] = useState<IosInstallModalKind | null>(null);

  const openIosInstall = useCallback(() => {
    setOpenKind(iosInstallModalKind());
  }, []);

  const close = useCallback(() => setOpenKind(null), []);

  const iosInstallModals =
    openKind === "safari-instructions" ? (
      <IosSafariInstallModal onClose={close} />
    ) : openKind === "open-in-safari" ? (
      <IosInstallModal onClose={close} />
    ) : null;

  return { openIosInstall, iosInstallModals };
}
