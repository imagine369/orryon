"use client";

import { useState } from "react";

const TERMINAL_CMD = "xattr -cr /Applications/Orryon.app";

export function MacInstallHelp() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(TERMINAL_CMD);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <div className="mt-8 max-w-md mx-auto rounded-xl border border-white/10 bg-white/[0.03] px-4 py-4 text-left text-sm text-white/50">
      <p className="font-medium text-white/75 mb-2">First time on Mac?</p>
      <p className="mb-3 leading-relaxed">
        If macOS says Orryon is &ldquo;damaged,&rdquo; it&apos;s Gatekeeper — the app is fine. After
        dragging to Applications:
      </p>
      <ol className="list-decimal list-inside space-y-2 mb-3 text-white/55">
        <li>
          <span className="text-white/70">Right-click</span> Orryon → <span className="text-white/70">Open</span> → Open again
        </li>
        <li>Or paste this in Terminal, then open from Applications:</li>
      </ol>
      <div className="flex items-center gap-2 rounded-lg bg-black/50 border border-white/10 px-3 py-2 font-mono text-[11px] text-white/70 break-all">
        <code className="flex-1">{TERMINAL_CMD}</code>
        <button
          type="button"
          onClick={() => void copy()}
          className="shrink-0 rounded-md border border-white/15 px-2 py-1 text-[10px] uppercase tracking-wide text-white/60 hover:text-white hover:border-white/30 transition-colors"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}
