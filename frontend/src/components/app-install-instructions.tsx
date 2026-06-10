"use client";

import { Plus, Share } from "lucide-react";

function InstructionBlock({
  title,
  large,
  children,
}: {
  title: string;
  large?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={
        large
          ? "rounded-2xl border border-white/15 bg-[#141414] p-5 space-y-5 text-left"
          : "rounded-xl border border-white/[0.06] bg-white/[0.03] p-4 space-y-3 text-left"
      }
    >
      <p
        className={
          large
            ? "text-sm text-white/70 font-semibold uppercase tracking-wider"
            : "text-xs text-white/45 font-medium uppercase tracking-wider"
        }
      >
        {title}
      </p>
      {children}
    </div>
  );
}

function Step({
  step,
  icon,
  title,
  detail,
  large,
}: {
  step: number;
  icon?: React.ReactNode;
  title: string;
  detail: string;
  large?: boolean;
}) {
  return (
    <div className="flex items-start gap-4">
      <div
        className={
          large
            ? "w-10 h-10 rounded-full bg-white/12 flex items-center justify-center shrink-0 text-sm font-bold text-white/80"
            : "w-7 h-7 rounded-full bg-white/[0.08] flex items-center justify-center shrink-0 mt-0.5 text-[11px] font-semibold text-white/50"
        }
      >
        {icon ?? step}
      </div>
      <div className="min-w-0 pt-0.5">
        <p className={large ? "text-base font-medium text-white leading-snug" : "text-[13px] text-white/80"}>
          {title}
        </p>
        <p
          className={
            large
              ? "text-sm text-white/55 mt-1.5 leading-relaxed"
              : "text-[11px] text-white/35 mt-0.5 leading-relaxed"
          }
        >
          {detail}
        </p>
      </div>
    </div>
  );
}

/** Safari toolbar steps for Add to Home Screen (used in IosSafariInstallModal). */
export function IosInstallInstructions({ large = false }: { large?: boolean } = {}) {
  const iconSize = large ? "h-4 w-4" : "h-3 w-3";
  return (
    <InstructionBlock title="In Safari" large={large}>
      <Step
        large={large}
        step={1}
        icon={<Share className={`${iconSize} text-white/70`} strokeWidth={1.5} />}
        title='Tap Share (□↑) at the bottom of Safari'
        detail="Look at Safari's bottom toolbar — not inside this popup"
      />
      <Step
        large={large}
        step={2}
        icon={<Plus className={`${iconSize} text-white/70`} strokeWidth={1.5} />}
        title='Tap "Add to Home Screen"'
        detail="Scroll down in the share sheet if you don't see it"
      />
      <Step
        large={large}
        step={3}
        title='Tap "Add" in the top-right'
        detail="Then open Orryon from your home screen"
      />
    </InstructionBlock>
  );
}
