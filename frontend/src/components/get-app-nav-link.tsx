"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PillButton } from "@/components/pill-cta";
import { appNavInstallLabel, isIosInstallContext } from "@/lib/ios-install";
import { detectPlatform } from "@/lib/platform";
import { useIosInstallModals } from "@/lib/use-ios-install-modals";

type CtaSize = "sm" | "md" | "lg";
type CtaVariant = "primary" | "secondary" | "calm";

/** Shared install CTA — iOS opens install modal; other platforms go to /download. */
export function GetAppInstallCta({
  size = "sm",
  variant = "primary",
  className,
}: {
  size?: CtaSize;
  variant?: CtaVariant;
  className?: string;
} = {}) {
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
      <PillButton type="button" onClick={handleClick} size={size} variant={variant} className={className}>
        {label}
      </PillButton>
      {iosInstallModals}
    </>
  );
}

/** Compact nav install entry (alias for GetAppInstallCta). */
export function GetAppNavLink() {
  return <GetAppInstallCta size="sm" variant="primary" />;
}
