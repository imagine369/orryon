"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PillButton } from "@/components/pill-cta";
import { appNavInstallLabel, isIosInstallContext } from "@/lib/ios-install";
import { detectPlatform } from "@/lib/platform";
import { useIosInstallModals } from "@/lib/use-ios-install-modals";

/** Download / install entry — on iPhone/iPad always opens an install modal (never a silent no-op). */
export function GetAppNavLink() {
  const router = useRouter();
  const { openIosInstall, iosInstallModals } = useIosInstallModals();
  // Stable "Download" for SSR + first paint — updated after mount to avoid hydration mismatch on iOS.
  const [label, setLabel] = useState("Download");

  useEffect(() => {
    queueMicrotask(() => {
      setLabel(appNavInstallLabel(detectPlatform()));
    });
  }, []);

  function handleClick() {
    const platform = detectPlatform();
    if (isIosInstallContext(platform)) {
      openIosInstall();
      return;
    }
    router.push("/download");
  }

  return (
    <>
      <PillButton type="button" onClick={handleClick} size="sm" variant="primary">
        {label}
      </PillButton>
      {iosInstallModals}
    </>
  );
}
