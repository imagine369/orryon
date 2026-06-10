"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PillButton } from "@/components/pill-cta";
import { IosInstallModal } from "@/components/ios-install-modal";
import { detectPlatform, isStandalonePwa } from "@/lib/platform";

/** Download / install entry — on iPhone opens install steps instead of leaving the page. */
export function GetAppNavLink() {
  const router = useRouter();
  const [iosModalOpen, setIosModalOpen] = useState(false);

  function handleClick() {
    const platform = detectPlatform();
    if (platform === "ios" && !isStandalonePwa()) {
      setIosModalOpen(true);
      return;
    }
    router.push("/download");
  }

  return (
    <>
      <PillButton type="button" onClick={handleClick} size="sm" variant="primary">
        Download
      </PillButton>
      {iosModalOpen && <IosInstallModal onClose={() => setIosModalOpen(false)} />}
    </>
  );
}
