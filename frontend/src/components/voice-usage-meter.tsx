"use client";

import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";
import type { VoiceUsage } from "@/lib/use-voice-usage";

interface VoiceUsageMeterProps {
  usage: VoiceUsage;
  /** "compact" = one-line bar (for settings rows), "full" = labelled meter */
  variant?: "compact" | "full";
  className?: string;
}

/**
 * Displays a voice-minute usage bar.
 * Uses only existing design tokens — no new colours introduced.
 */
export function VoiceUsageMeter({
  usage,
  variant = "compact",
  className,
}: VoiceUsageMeterProps) {
  const {
    minutes_used,
    total_available_minutes,
    remaining_minutes,
    reset_date,
  } = usage;

  const pct =
    total_available_minutes > 0
      ? Math.min(100, Math.round((minutes_used / total_available_minutes) * 100))
      : 0;

  const isNearLimit = pct >= 80;
  const isAtLimit = remaining_minutes <= 0;

  const resetLabel = (() => {
    const d = new Date(reset_date);
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  })();

  if (variant === "compact") {
    return (
      <div className={cn("flex flex-col gap-1.5 w-full", className)}>
        <div className="flex items-center justify-between text-xs text-white/40">
          <span className="flex items-center gap-1">
            <Mic className="w-3 h-3" strokeWidth={1.5} />
            {isAtLimit ? (
              <span className="text-white/60">No minutes left</span>
            ) : (
              <span>
                {Math.round(minutes_used)}&thinsp;/&thinsp;{total_available_minutes} min
              </span>
            )}
          </span>
          <span>resets {resetLabel}</span>
        </div>

        {/* Progress bar */}
        <div className="h-1 w-full rounded-full bg-white/[0.08] overflow-hidden">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isAtLimit
                ? "bg-white/50"
                : isNearLimit
                  ? "bg-white/70"
                  : "bg-white/35"
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    );
  }

  // full variant — used inside the settings voice view
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Mic className="w-4 h-4 text-white/50" strokeWidth={1.5} />
          <span className="text-sm text-white/70">Voice minutes</span>
        </div>
        <span
          className={cn(
            "text-sm font-medium tabular-nums",
            isAtLimit ? "text-white/50" : "text-white/85"
          )}
        >
          {Math.round(minutes_used)}&thinsp;/&thinsp;{total_available_minutes} min
        </span>
      </div>

      {/* Bar */}
      <div className="h-1.5 w-full rounded-full bg-white/[0.08] overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full transition-all duration-500",
            isAtLimit
              ? "bg-white/40"
              : isNearLimit
                ? "bg-white/65"
                : "bg-white/40"
          )}
          style={{ width: `${Math.max(pct, pct > 0 ? 2 : 0)}%` }}
        />
      </div>

      {/* Sub-labels */}
      <div className="flex items-center justify-between text-xs text-white/30">
        <span>
          {isAtLimit
            ? "All included minutes used"
            : `${Math.round(remaining_minutes)} min remaining`}
        </span>
        <span>Resets {resetLabel}</span>
      </div>
    </div>
  );
}
