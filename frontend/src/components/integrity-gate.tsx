"use client";

import { useEffect, useState } from "react";
import { assertTrustedHost } from "@/lib/integrity";

/**
 * Boot-time host check. If the page is served from an origin that isn't on
 * the Orryon allowlist we swap the entire tree for a branded notice and
 * refuse to initialize the app. See `@/lib/integrity` for rationale.
 */
export function IntegrityGate({ children }: { children: React.ReactNode }) {
  const [blocked, setBlocked] = useState<string | null>(null);

  useEffect(() => {
    try {
      assertTrustedHost();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "untrusted-host";
      setBlocked(msg.replace("untrusted-host:", ""));
    }
  }, []);

  if (blocked) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-black text-white">
        <div className="max-w-md text-center space-y-3">
          <h1 className="text-xl font-medium">This isn&apos;t an official Orryon deployment.</h1>
          <p className="text-sm text-white/60">
            For the real app visit{" "}
            <a className="underline" href="https://www.orryon.com">
              www.orryon.com
            </a>
            .
          </p>
          <p className="text-xs text-white/30">host: {blocked}</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
