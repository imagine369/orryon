"use client";

import { CHAT_STARTER_PROMPTS } from "@/lib/life-os-copy";

interface ChatStarterPromptsProps {
  onPick: (message: string) => void;
  disabled?: boolean;
}

export function ChatStarterPrompts({ onPick, disabled }: ChatStarterPromptsProps) {
  return (
    <div className="flex flex-wrap justify-center gap-2 mb-3">
      {CHAT_STARTER_PROMPTS.map((p) => (
        <button
          key={p.label}
          type="button"
          disabled={disabled}
          onClick={() => onPick(p.message)}
          className="rounded-full border border-white/[0.1] bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/55 transition hover:border-white/[0.18] hover:bg-white/[0.08] hover:text-white/80 disabled:opacity-40"
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
