"use client";

import { InstallButton } from "@/components/install-prompt";

export function AppView() {
  return (
    <div>
      <InstallButton />
      <a
        href="/download"
        className="mt-3 block text-center text-xs text-white/25 hover:text-white/45 transition"
      >
        View all download options →
      </a>
    </div>
  );
}
