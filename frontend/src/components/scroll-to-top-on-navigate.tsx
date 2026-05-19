"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Jump to top on every client-side route change (footer links, etc.). */
export function ScrollToTopOnNavigate() {
  const pathname = usePathname();

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  return null;
}
