"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { parseLifePriorities } from "@/lib/life-priorities";
import { usePreferences } from "@/lib/use-preferences";
import {
  DEFAULT_STARTER_PROMPTS,
  pickPersonalizedStarterPrompts,
  type StarterPrompt,
  type StarterTopicId,
} from "@/lib/personalized-starter-prompts";

interface ChatStarterPromptsProps {
  onPick: (message: string) => void;
  disabled?: boolean;
}

type HistoryRow = { role?: string; content?: string };
type MemoryRow = { fact?: string };

export function ChatStarterPrompts({ onPick, disabled }: ChatStarterPromptsProps) {
  const { prefs } = usePreferences();
  const [prompts, setPrompts] = useState<StarterPrompt[]>(DEFAULT_STARTER_PROMPTS);

  const priorityKey = prefs.life_priorities.join(",");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [history, memory] = await Promise.all([
          api.get<HistoryRow[]>("/api/chat/history?limit=200").catch(() => []),
          api
            .get<{ facts?: MemoryRow[] }>("/api/memory")
            .catch(() => ({ facts: [] })),
        ]);

        if (cancelled) return;

        const userMessages = (history ?? [])
          .filter((m) => m.role === "user" && typeof m.content === "string")
          .map((m) => m.content as string);

        const memoryFacts = (memory?.facts ?? [])
          .map((f) => f.fact)
          .filter((f): f is string => typeof f === "string" && f.length > 0);

        const declared = parseLifePriorities(
          prefs.life_priorities,
        ) as StarterTopicId[];

        setPrompts(
          pickPersonalizedStarterPrompts(
            userMessages,
            memoryFacts,
            4,
            declared,
          ),
        );
      } catch {
        /* keep defaults */
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [priorityKey, prefs.life_priorities_set]);

  return (
    <div className="flex flex-wrap justify-center gap-2 mb-3">
      {prompts.map((p) => (
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
